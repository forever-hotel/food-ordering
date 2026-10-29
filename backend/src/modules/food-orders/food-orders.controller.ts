import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentGuest } from '../guest-sessions/decorators/current-guest.decorator.js';
import { GuestAuthGuard } from '../guest-sessions/guards/guest-auth.guard.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { AdvanceOrderStatusDto } from './dto/advance-order-status.dto.js';
import { CancelFoodOrderDto } from './dto/cancel-food-order.dto.js';
import { CreateFoodOrderDto } from './dto/create-food-order.dto.js';
import { FoodOrderResponseDto } from './dto/food-order-response.dto.js';
import { FoodOrdersService } from './food-orders.service.js';

@ApiTags('Food Orders')
@ApiBearerAuth()
@UseGuards(GuestAuthGuard)
@Controller('food-orders')
export class FoodOrdersController {
  constructor(private readonly foodOrdersService: FoodOrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a new food order atomically with KMS',
    description:
      'Validates quantities, stock, operational meal windows in Asia/Colombo, computes server-authoritative prices, and idempotently dispatches to KMS.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Unique client-generated idempotency key (header or body property)',
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: false,
    description: 'Alternative unique client-generated idempotency key header',
  })
  @ApiResponse({
    status: 201,
    description:
      'Food order successfully placed or idempotent replay returned.',
    type: FoodOrderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed, missing idempotency key, or meal window cutoff passed.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. Invalid or missing guest session token.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict. Menu item is sold out.',
  })
  @ApiResponse({
    status: 503,
    description: 'Upstream KMS service is unreachable.',
  })
  public async createOrder(
    @CurrentGuest() guest: GuestContext,
    @Body() dto: CreateFoodOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<FoodOrderResponseDto> {
    const key = idempotencyKey || xIdempotencyKey;
    return this.foodOrdersService.createFoodOrder(guest, dto, key);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get food order by ID',
    description:
      'Retrieves an order belonging to the current authenticated guest stay with timeline tracker and cancellation eligibility.',
  })
  @ApiResponse({
    status: 200,
    description: 'Order found and returned.',
    type: FoodOrderResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Order belongs to another room or booking.',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found.',
  })
  public async getOrder(
    @CurrentGuest() guest: GuestContext,
    @Param('id') id: string,
  ): Promise<FoodOrderResponseDto> {
    return this.foodOrdersService.getGuestOrderById(guest, id);
  }

  @Get()
  @ApiOperation({
    summary: 'List food orders for the current stay',
    description:
      'Retrieves all food orders placed during the current room stay.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of orders for the room stay.',
    type: [FoodOrderResponseDto],
  })
  public async getOrders(
    @CurrentGuest() guest: GuestContext,
  ): Promise<FoodOrderResponseDto[]> {
    return this.foodOrdersService.getGuestOrders(guest);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an order within 10 minutes of placement',
    description:
      'Allows guest cancellation within 10 minutes of order creation, provided kitchen preparation has not yet begun.',
  })
  @ApiResponse({
    status: 200,
    description: 'Order successfully cancelled.',
    type: FoodOrderResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. Order belongs to another room or booking.',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Conflict. Order has already been cancelled, delivered, in preparation, or the 10-minute window has expired.',
  })
  public async cancelOrder(
    @CurrentGuest() guest: GuestContext,
    @Param('id') id: string,
    @Body() dto: CancelFoodOrderDto,
  ): Promise<FoodOrderResponseDto> {
    return this.foodOrdersService.cancelFoodOrder(guest, id, dto?.reason);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Advance order status for deterministic demo flow (DEMO_MODE only)',
    description:
      'Advances order lifecycle status in KMS and demo persistence. Gated by DEMO_MODE.',
  })
  @ApiResponse({
    status: 200,
    description: 'Order status successfully advanced.',
    type: FoodOrderResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden. DEMO_MODE is not enabled or cross-room access.',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found.',
  })
  public async advanceOrderStatus(
    @CurrentGuest() guest: GuestContext,
    @Param('id') id: string,
    @Body() dto: AdvanceOrderStatusDto,
  ): Promise<FoodOrderResponseDto> {
    return this.foodOrdersService.advanceOrderStatus(guest, id, dto.status);
  }
}
