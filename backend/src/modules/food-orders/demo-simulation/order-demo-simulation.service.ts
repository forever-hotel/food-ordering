import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KmsProvider,
  KMS_PROVIDER,
} from '../../../integrations/internal-services/kms/interfaces/kms-provider.interface.js';
import { RealtimeEventType } from '../../../realtime/enums/realtime-event-type.enum.js';
import { RealtimeService } from '../../../realtime/realtime.service.js';
import type { GuestContext } from '../../guest-sessions/interfaces/guest-context.interface.js';
import { HotelClockService } from '../../menu/services/hotel-clock.service.js';
import { FoodOrderResponseDto } from '../dto/food-order-response.dto.js';
import { FoodOrderStatus } from '../enums/food-order-status.enum.js';
import { mapFoodOrderToResponse } from '../order-response.mapper.js';
import { FossDemoOrderRepository } from '../repositories/foss-demo-order.repository.js';
import { assertOrderDemoSimulationEnabled } from './order-demo-simulation.policy.js';

/**
 * Isolated service for development/test order status demo simulation.
 * Completely separated from production order tracking and blocked in production/staging
 * as well as when shared/real KMS persistence is active.
 */
@Injectable()
export class OrderDemoSimulationService {
  constructor(
    @Inject(KMS_PROVIDER)
    private readonly kmsProvider: KmsProvider,
    private readonly clockService: HotelClockService,
    private readonly orderRepository: FossDemoOrderRepository,
    private readonly configService: ConfigService,
    @Optional()
    private readonly realtimeService?: RealtimeService,
  ) {}

  /**
   * Deterministic status advance utility gated by ENABLE_ORDER_DEMO_SIMULATION and DEMO_MODE
   * for isolated non-production rehearsal flows.
   */
  public async advanceOrderStatus(
    guest: GuestContext,
    orderId: string,
    newStatus: FoodOrderStatus,
  ): Promise<FoodOrderResponseDto> {
    assertOrderDemoSimulationEnabled(this.configService);

    if (
      this.orderRepository?.constructor?.name === 'SharedFoodOrderRepository'
    ) {
      throw new ForbiddenException(
        'Demo order status simulation cannot operate against shared canonical order persistence.',
      );
    }

    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order [${orderId}] was not found.`);
    }

    if (
      order.roomNumber !== guest.roomNumber ||
      order.bookingId !== guest.bookingId
    ) {
      throw new ForbiddenException(
        'You do not have permission to modify orders from another room or booking.',
      );
    }

    await this.kmsProvider.transitionOrderStatus(orderId, newStatus);

    const now = this.clockService.now();
    order.status = newStatus;
    order.updatedAt = now;

    if (newStatus === FoodOrderStatus.DELIVERED) {
      order.estimatedDeliveryMinutes = 0;
    } else if (newStatus === FoodOrderStatus.READY) {
      order.estimatedDeliveryMinutes = 5;
    }

    await this.orderRepository.save(order);
    const response = mapFoodOrderToResponse(order, now, now);
    this.realtimeService?.emitToStay(
      guest.bookingId,
      guest.roomNumber,
      RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
      response,
    );
    return response;
  }
}
