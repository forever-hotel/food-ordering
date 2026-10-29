import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ContractVersion } from '../../integrations/contracts/contract-version.enum.js';
import { UpstreamServiceUnavailableException } from '../../integrations/contracts/upstream-integration.exception.js';
import {
  KmsOrderItemDto,
  KmsCreateOrderDto,
} from '../../integrations/internal-services/kms/dto/kms-order.dto.js';
import {
  KmsProvider,
  KMS_PROVIDER,
} from '../../integrations/internal-services/kms/interfaces/kms-provider.interface.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { HotelClockService } from '../menu/services/hotel-clock.service.js';
import { MealWindowService } from '../menu/services/meal-window.service.js';
import { CreateFoodOrderDto } from './dto/create-food-order.dto.js';
import {
  FoodOrderItemResponseDto,
  FoodOrderResponseDto,
} from './dto/food-order-response.dto.js';
import { FossDemoOrderItem } from './entities/foss-demo-order-item.entity.js';
import { FossDemoOrder } from './entities/foss-demo-order.entity.js';
import { FossDemoOrderRepository } from './repositories/foss-demo-order.repository.js';

@Injectable()
export class FoodOrdersService {
  private readonly logger = new Logger(FoodOrdersService.name);

  constructor(
    @Inject(KMS_PROVIDER)
    private readonly kmsProvider: KmsProvider,
    private readonly mealWindowService: MealWindowService,
    private readonly clockService: HotelClockService,
    private readonly orderRepository: FossDemoOrderRepository,
  ) {}

  /**
   * Submits a food order atomically to authoritative KMS with strict server-side validation,
   * operational meal window enforcement (Asia/Colombo), server-calculated pricing, and idempotency.
   */
  public async createFoodOrder(
    guest: GuestContext,
    dto: CreateFoodOrderDto,
    idempotencyKeyHeader?: string,
  ): Promise<FoodOrderResponseDto> {
    const idempotencyKey = (
      idempotencyKeyHeader ||
      dto.idempotencyKey ||
      ''
    ).trim();

    if (!idempotencyKey) {
      throw new BadRequestException(
        'Idempotency key is required via Idempotency-Key header or idempotencyKey property.',
      );
    }

    // 1. Idempotency Check: Return existing order if already processed
    const existingOrder =
      await this.orderRepository.findByIdempotencyKey(idempotencyKey);
    if (existingOrder) {
      if (
        existingOrder.roomNumber !== guest.roomNumber ||
        existingOrder.bookingId !== guest.bookingId
      ) {
        throw new ForbiddenException(
          'Idempotency key was used by a different room or booking.',
        );
      }

      this.logger.log(
        `Idempotent order replay: returning existing order [${existingOrder.orderId}] for room [${guest.roomNumber}].`,
      );
      return this.mapToResponse(existingOrder);
    }

    // 2. Validate items
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item.');
    }

    // 3. Query authoritative KMS menu catalog for validation and current pricing
    let catalog;
    try {
      catalog = await this.kmsProvider.getMenuCatalog();
    } catch (err: unknown) {
      if (err instanceof UpstreamServiceUnavailableException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new UpstreamServiceUnavailableException('KMS', msg);
    }

    const now = this.clockService.now();
    const validatedItems: KmsOrderItemDto[] = [];
    let totalAmount = 0;

    for (const reqItem of dto.items) {
      const catalogItem = catalog.items.find(
        (i) => i.id === reqItem.menuItemId,
      );
      if (!catalogItem) {
        throw new BadRequestException(
          `Menu item '${reqItem.menuItemId}' does not exist in the menu catalog.`,
        );
      }

      if (!catalogItem.available) {
        throw new ConflictException(
          `Menu item '${catalogItem.name}' is currently unavailable (sold out).`,
        );
      }

      const orderableStatus = this.mealWindowService.isItemOrderable(
        catalogItem.mealPeriods,
        now,
      );
      if (!orderableStatus.isOrderable) {
        throw new BadRequestException(
          `Ordering for '${catalogItem.name}' is closed. The meal window cutoff has passed.`,
        );
      }

      if (!reqItem.quantity || reqItem.quantity < 1 || reqItem.quantity > 20) {
        throw new BadRequestException(
          `Quantity for '${catalogItem.name}' must be between 1 and 20.`,
        );
      }

      // Server-authoritative price calculation
      const unitPrice = catalogItem.price;
      const lineTotal = Number((unitPrice * reqItem.quantity).toFixed(2));
      totalAmount = Number((totalAmount + lineTotal).toFixed(2));

      validatedItems.push({
        itemId: catalogItem.id,
        name: catalogItem.name,
        unitPrice,
        quantity: reqItem.quantity,
        specialNotes: reqItem.specialNotes?.trim() || undefined,
      });
    }

    // 4. Dispatch order to authoritative KMS
    const kmsOrderPayload: KmsCreateOrderDto = {
      roomNumber: guest.roomNumber,
      bookingId: guest.bookingId,
      items: validatedItems,
      totalAmount,
      allergyNotes: dto.allergyNote?.trim() || undefined,
      idempotencyKey,
      version: ContractVersion.V1_0,
    };

    this.logger.log(
      `Dispatching order to KMS for room [${guest.roomNumber}], items: ${validatedItems.length}, total: ${totalAmount}`,
    );

    let kmsResult;
    try {
      kmsResult = await this.kmsProvider.createOrder(kmsOrderPayload);
    } catch (err: unknown) {
      if (err instanceof UpstreamServiceUnavailableException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new UpstreamServiceUnavailableException('KMS', msg);
    }

    // 5. Persist FOSS demo order projection and idempotency record
    const demoOrder = new FossDemoOrder();
    demoOrder.orderId = kmsResult.orderId;
    demoOrder.bookingId = guest.bookingId;
    demoOrder.roomNumber = guest.roomNumber;
    demoOrder.status = kmsResult.status;
    demoOrder.totalAmount = kmsResult.totalAmount;
    demoOrder.allergyNotes = kmsResult.allergyNotes ?? null;
    demoOrder.idempotencyKey = idempotencyKey;
    demoOrder.estimatedDeliveryMinutes =
      kmsResult.estimatedDeliveryMinutes ?? 25;
    demoOrder.createdAt = new Date(kmsResult.createdAt);
    demoOrder.updatedAt = new Date(kmsResult.updatedAt);
    demoOrder.items = validatedItems.map((vi) => {
      const itemEntity = new FossDemoOrderItem();
      itemEntity.orderId = kmsResult.orderId;
      itemEntity.menuItemId = vi.itemId;
      itemEntity.name = vi.name;
      itemEntity.unitPrice = vi.unitPrice;
      itemEntity.quantity = vi.quantity;
      itemEntity.specialNotes = vi.specialNotes ?? null;
      return itemEntity;
    });

    try {
      await this.orderRepository.save(demoOrder);
    } catch (err: unknown) {
      // Handle race condition on duplicate idempotency key
      const duplicateError = err as { code?: string; message?: string };
      if (
        duplicateError?.code === '23505' ||
        duplicateError?.message?.includes('duplicate key') ||
        duplicateError?.message?.includes('UNIQUE constraint')
      ) {
        const existing =
          await this.orderRepository.findByIdempotencyKey(idempotencyKey);
        if (existing) {
          return this.mapToResponse(existing);
        }
      }
      throw err;
    }

    return this.mapToResponse(demoOrder);
  }

  /**
   * Retrieves an order by ID ensuring room and booking scope.
   */
  public async getGuestOrderById(
    guest: GuestContext,
    orderId: string,
  ): Promise<FoodOrderResponseDto> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order [${orderId}] was not found.`);
    }

    if (
      order.roomNumber !== guest.roomNumber ||
      order.bookingId !== guest.bookingId
    ) {
      throw new ForbiddenException(
        'You do not have permission to view orders from another room or booking.',
      );
    }

    return this.mapToResponse(order);
  }

  /**
   * Retrieves all orders for the current authenticated guest stay.
   */
  public async getGuestOrders(
    guest: GuestContext,
  ): Promise<FoodOrderResponseDto[]> {
    const orders = await this.orderRepository.findByBookingAndRoom(
      guest.bookingId,
      guest.roomNumber,
    );

    return orders.map((order) => this.mapToResponse(order));
  }

  private mapToResponse(order: FossDemoOrder): FoodOrderResponseDto {
    const items: FoodOrderItemResponseDto[] = (order.items || []).map((i) => ({
      itemId: i.menuItemId,
      name: i.name,
      unitPrice: Number(i.unitPrice),
      quantity: i.quantity,
      specialNotes: i.specialNotes ?? undefined,
    }));

    return {
      orderId: order.orderId,
      roomNumber: order.roomNumber,
      bookingId: order.bookingId,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      items,
      allergyNotes: order.allergyNotes ?? undefined,
      estimatedDeliveryMinutes: order.estimatedDeliveryMinutes,
      createdAt:
        order.createdAt instanceof Date
          ? order.createdAt.toISOString()
          : String(order.createdAt),
      updatedAt:
        order.updatedAt instanceof Date
          ? order.updatedAt.toISOString()
          : String(order.updatedAt),
      idempotencyKey: order.idempotencyKey,
    };
  }
}
