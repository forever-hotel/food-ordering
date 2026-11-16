import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UpstreamServiceUnavailableException } from '../../../contracts/upstream-integration.exception.js';
import { FoodOrderStatus } from '../../../../modules/food-orders/enums/food-order-status.enum.js';
import { KmsMenuCatalogDto, MealPeriod } from '../dto/kms-menu.dto.js';
import { KmsCreateOrderDto } from '../dto/kms-order.dto.js';
import { KmsOrderResultDto } from '../dto/kms-order-result.dto.js';
import { KmsProvider } from '../interfaces/kms-provider.interface.js';
import { kitchenIdempotencyKey } from './kms-idempotency.js';

@Injectable()
export class RealKmsAdapter implements KmsProvider {
  private readonly logger = new Logger(RealKmsAdapter.name);

  constructor(
    private readonly baseUrl?: string,
    private readonly apiKey?: string,
  ) {}

  public async getMenuCatalog(
    mealPeriod?: MealPeriod,
  ): Promise<KmsMenuCatalogDto> {
    this.assertConfigured();
    return this.executeHttpCall<KmsMenuCatalogDto>(
      '/api/v1/guest/menu' +
        (mealPeriod ? `?mealPeriod=${encodeURIComponent(mealPeriod)}` : ''),
      'GET',
    );
  }

  public async createOrder(
    order: KmsCreateOrderDto,
  ): Promise<KmsOrderResultDto> {
    this.assertConfigured();
    const catalog = await this.getMenuCatalog();
    const items = order.items.map((item) =>
      catalog.items.find((menu) => menu.id === item.itemId),
    );
    const mealPeriod = items[0]?.mealPeriods[0];
    if (
      !mealPeriod ||
      items.some((item) => !item || !item.mealPeriods.includes(mealPeriod))
    )
      throw new BadRequestException(
        'Items must belong to one kitchen meal period',
      );
    return this.executeHttpCall<KmsOrderResultDto>(
      '/api/v1/guest/orders',
      'POST',
      {
        idempotencyKey: kitchenIdempotencyKey(
          order.bookingId,
          order.idempotencyKey,
        ),
        bookingId: order.bookingId,
        roomNumber: order.roomNumber,
        mealPeriod,
        allergyNote: order.allergyNotes ?? null,
        items: order.items.map((item) => ({
          menuItemId: item.itemId,
          quantity: item.quantity,
          specialNote: item.specialNotes ?? null,
        })),
      },
    );
  }

  public async getOrder(orderId: string): Promise<KmsOrderResultDto | null> {
    this.assertConfigured();
    return this.executeHttpCall<KmsOrderResultDto>(
      `/api/v1/guest/orders/${encodeURIComponent(orderId)}`,
      'GET',
    );
  }

  public async cancelOrder(
    orderId: string,
    reason?: string,
  ): Promise<KmsOrderResultDto> {
    this.assertConfigured();
    return this.executeHttpCall<KmsOrderResultDto>(
      `/api/v1/guest/orders/${encodeURIComponent(orderId)}/cancel`,
      'POST',
      { reason },
    );
  }

  /**
   * Kitchen order status transitions are strictly owned by KMS.
   * FOSS has no authoritative kitchen domain permissions to advance or mutate
   * order states (Placed -> In Preparation -> Ready -> Delivered) in production.
   * Unauthorized mutations are rejected with ForbiddenException.
   */
  public async transitionOrderStatus(
    orderId: string,
    newStatus: FoodOrderStatus,
  ): Promise<KmsOrderResultDto> {
    this.assertConfigured();
    this.logger.warn(
      `Rejecting unauthorized order status transition for order [${orderId}] to [${newStatus}]: Kitchen order status transitions are strictly owned by KMS.`,
    );
    throw new ForbiddenException(
      'Kitchen order status transitions are strictly owned by KMS. FOSS cannot mutate kitchen order statuses in production.',
    );
  }

  private assertConfigured(): void {
    if (
      !this.baseUrl ||
      this.baseUrl.trim() === '' ||
      !this.apiKey ||
      this.apiKey.length < 32
    ) {
      this.logger.error(
        'KMS service URL is missing or unconfigured. Failing closed.',
      );
      throw new UpstreamServiceUnavailableException(
        'KMS',
        'Kitchen Management System endpoint is unconfigured in this environment.',
      );
    }
  }

  private async executeHttpCall<T>(
    endpoint: string,
    method: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl!.replace(/\/$/, '')}${endpoint}`;
    this.logger.log(`Executing upstream KMS request: ${method} ${url}`);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        if (response.status === 400)
          throw new BadRequestException('Kitchen rejected invalid order data');
        if (response.status === 404)
          throw new NotFoundException('Kitchen item or order not found');
        if (response.status === 409)
          throw new ConflictException(
            'Kitchen order state or availability changed',
          );
        throw new Error(
          `Upstream KMS returned HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (err: any) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof ConflictException
      )
        throw err;
      this.logger.error(`Upstream KMS request failed: ${err.message}`);
      throw new UpstreamServiceUnavailableException('KMS', err.message);
    }
  }
}
