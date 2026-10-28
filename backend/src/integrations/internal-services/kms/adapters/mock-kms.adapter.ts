import { Injectable, Logger } from '@nestjs/common';
import { FoodOrderStatus } from '../../../../modules/food-orders/enums/food-order-status.enum.js';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';
import { KmsMenuCatalogDto, MealPeriod } from '../dto/kms-menu.dto.js';
import { KmsCreateOrderDto } from '../dto/kms-order.dto.js';
import { KmsOrderResultDto } from '../dto/kms-order-result.dto.js';
import {
  KMS_FIXTURE_CATALOG_V1,
  KMS_FIXTURE_ORDER_PLACED,
} from '../fixtures/kms-contract.fixtures.js';
import { KmsProvider } from '../interfaces/kms-provider.interface.js';

@Injectable()
export class MockKmsAdapter implements KmsProvider {
  private readonly logger = new Logger(MockKmsAdapter.name);

  private orders: Map<string, KmsOrderResultDto> = new Map();
  private idempotencyMap: Map<string, string> = new Map(); // key -> orderId
  private simulateDown = false;
  private simulateTimeout = false;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.orders.clear();
    this.idempotencyMap.clear();
    this.simulateDown = false;
    this.simulateTimeout = false;

    // Seed default fixture order
    const defaultOrder = { ...KMS_FIXTURE_ORDER_PLACED };
    this.orders.set(defaultOrder.orderId, defaultOrder);
    this.idempotencyMap.set('idemp-kms-fixture-001', defaultOrder.orderId);
  }

  public setSimulateDown(state: boolean): void {
    this.simulateDown = state;
  }

  public setSimulateTimeout(state: boolean): void {
    this.simulateTimeout = state;
  }

  public async getMenuCatalog(
    mealPeriod?: MealPeriod,
  ): Promise<KmsMenuCatalogDto> {
    this.checkSimulations();

    if (!mealPeriod || mealPeriod === MealPeriod.ALL_DAY) {
      return { ...KMS_FIXTURE_CATALOG_V1 };
    }

    const filteredItems = KMS_FIXTURE_CATALOG_V1.items.filter((item) =>
      item.mealPeriods.includes(mealPeriod),
    );

    return {
      version: ContractVersion.V1_0,
      generatedAt: new Date().toISOString(),
      categories: Array.from(new Set(filteredItems.map((i) => i.category))),
      items: filteredItems,
    };
  }

  public async createOrder(
    order: KmsCreateOrderDto,
  ): Promise<KmsOrderResultDto> {
    this.checkSimulations();

    if (this.idempotencyMap.has(order.idempotencyKey)) {
      const existingOrderId = this.idempotencyMap.get(order.idempotencyKey)!;
      this.logger.log(
        `Idempotent order replay detected for key [${order.idempotencyKey}]. Returning order [${existingOrderId}].`,
      );
      return this.orders.get(existingOrderId)!;
    }

    const orderId =
      order.orderId ||
      `order-kms-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    const createdOrder: KmsOrderResultDto = {
      orderId,
      roomNumber: order.roomNumber,
      bookingId: order.bookingId,
      status: FoodOrderStatus.PLACED,
      totalAmount: order.totalAmount,
      items: order.items,
      allergyNotes: order.allergyNotes,
      estimatedDeliveryMinutes: 25,
      createdAt: now,
      updatedAt: now,
      version: ContractVersion.V1_0,
    };

    this.orders.set(orderId, createdOrder);
    this.idempotencyMap.set(order.idempotencyKey, orderId);

    this.logger.log(
      `Mock KMS order created: [${orderId}] for room [${order.roomNumber}]`,
    );
    return createdOrder;
  }

  public async getOrder(orderId: string): Promise<KmsOrderResultDto | null> {
    this.checkSimulations();
    const order = this.orders.get(orderId);
    return order ? { ...order } : null;
  }

  public async cancelOrder(
    orderId: string,
    reason?: string,
  ): Promise<KmsOrderResultDto> {
    this.checkSimulations();

    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order [${orderId}] not found in KMS.`);
    }

    if (order.status === FoodOrderStatus.DELIVERED) {
      throw new Error(
        `Order [${orderId}] cannot be cancelled because it has already been delivered.`,
      );
    }

    order.status = FoodOrderStatus.CANCELLED;
    order.updatedAt = new Date().toISOString();
    this.orders.set(orderId, order);

    this.logger.log(
      `Mock KMS order cancelled: [${orderId}]${reason ? ` Reason: ${reason}` : ''}`,
    );
    return { ...order };
  }

  public transitionStatus(
    orderId: string,
    newStatus: FoodOrderStatus,
  ): KmsOrderResultDto {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order [${orderId}] not found in KMS.`);
    }

    order.status = newStatus;
    order.updatedAt = new Date().toISOString();
    if (newStatus === FoodOrderStatus.DELIVERED) {
      order.estimatedDeliveryMinutes = 0;
    } else if (newStatus === FoodOrderStatus.READY) {
      order.estimatedDeliveryMinutes = 5;
    }
    this.orders.set(orderId, order);
    return { ...order };
  }

  private checkSimulations(): void {
    if (this.simulateDown) {
      throw new Error(
        'KMS upstream gateway is unreachable (simulated connection refusal).',
      );
    }
    if (this.simulateTimeout) {
      throw new Error('KMS upstream gateway timed out after 5000ms.');
    }
  }
}
