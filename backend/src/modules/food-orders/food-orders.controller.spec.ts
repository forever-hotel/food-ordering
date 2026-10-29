import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { AdvanceOrderStatusDto } from './dto/advance-order-status.dto.js';
import { CancelFoodOrderDto } from './dto/cancel-food-order.dto.js';
import { CreateFoodOrderDto } from './dto/create-food-order.dto.js';
import { FoodOrderResponseDto } from './dto/food-order-response.dto.js';
import { FoodOrderStatus } from './enums/food-order-status.enum.js';
import { FoodOrdersController } from './food-orders.controller.js';
import { FoodOrdersService } from './food-orders.service.js';

describe('FoodOrdersController', () => {
  let controller: FoodOrdersController;
  let mockService: {
    createFoodOrder: jest.MockedFunction<FoodOrdersService['createFoodOrder']>;
    getGuestOrderById: jest.MockedFunction<
      FoodOrdersService['getGuestOrderById']
    >;
    getGuestOrders: jest.MockedFunction<FoodOrdersService['getGuestOrders']>;
    cancelFoodOrder: jest.MockedFunction<FoodOrdersService['cancelFoodOrder']>;
    advanceOrderStatus: jest.MockedFunction<
      FoodOrdersService['advanceOrderStatus']
    >;
  };

  const sampleGuest: GuestContext = {
    sessionId: 'session-uuid-101',
    bookingId: 'booking-uuid-101',
    guestId: 'guest-101',
    roomNumber: '101',
    guestName: 'Jane Doe',
    stayStart: new Date(),
    stayEnd: new Date(Date.now() + 86400000),
    role: 'GUEST',
  };

  const sampleResponse: FoodOrderResponseDto = {
    orderId: 'order-101',
    roomNumber: '101',
    bookingId: 'booking-uuid-101',
    status: FoodOrderStatus.PLACED,
    totalAmount: 36.0,
    items: [],
    estimatedDeliveryMinutes: 25,
    createdAt: new Date().toISOString(),
    idempotencyKey: 'idemp-101',
  };

  beforeEach(() => {
    mockService = {
      createFoodOrder: jest.fn(),
      getGuestOrderById: jest.fn(),
      getGuestOrders: jest.fn(),
      cancelFoodOrder: jest.fn(),
      advanceOrderStatus: jest.fn(),
    };

    controller = new FoodOrdersController(
      mockService as unknown as FoodOrdersService,
    );
  });

  describe('createOrder()', () => {
    it('calls foodOrdersService.createFoodOrder and returns response', async () => {
      mockService.createFoodOrder.mockResolvedValue(sampleResponse);

      const dto: CreateFoodOrderDto = {
        items: [{ menuItemId: 'menu-item-001', quantity: 2 }],
      };

      const result = await controller.createOrder(
        sampleGuest,
        dto,
        'idemp-header-1',
      );

      expect(result).toBe(sampleResponse);
      expect(mockService.createFoodOrder).toHaveBeenCalledWith(
        sampleGuest,
        dto,
        'idemp-header-1',
      );
    });
  });

  describe('getOrder()', () => {
    it('calls foodOrdersService.getGuestOrderById and returns order', async () => {
      mockService.getGuestOrderById.mockResolvedValue(sampleResponse);

      const result = await controller.getOrder(sampleGuest, 'order-101');

      expect(result).toBe(sampleResponse);
      expect(mockService.getGuestOrderById).toHaveBeenCalledWith(
        sampleGuest,
        'order-101',
      );
    });
  });

  describe('getOrders()', () => {
    it('calls foodOrdersService.getGuestOrders and returns orders list', async () => {
      mockService.getGuestOrders.mockResolvedValue([sampleResponse]);

      const result = await controller.getOrders(sampleGuest);

      expect(result).toEqual([sampleResponse]);
      expect(mockService.getGuestOrders).toHaveBeenCalledWith(sampleGuest);
    });
  });

  describe('cancelOrder()', () => {
    it('calls foodOrdersService.cancelFoodOrder and returns cancelled order', async () => {
      const cancelledResponse = {
        ...sampleResponse,
        status: FoodOrderStatus.CANCELLED,
      };
      mockService.cancelFoodOrder.mockResolvedValue(cancelledResponse);

      const dto: CancelFoodOrderDto = { reason: 'Guest changed mind' };
      const result = await controller.cancelOrder(
        sampleGuest,
        'order-101',
        dto,
      );

      expect(result.status).toBe(FoodOrderStatus.CANCELLED);
      expect(mockService.cancelFoodOrder).toHaveBeenCalledWith(
        sampleGuest,
        'order-101',
        'Guest changed mind',
      );
    });
  });

  describe('advanceOrderStatus()', () => {
    it('calls foodOrdersService.advanceOrderStatus and returns updated order', async () => {
      const advancedResponse = {
        ...sampleResponse,
        status: FoodOrderStatus.IN_PREPARATION,
      };
      mockService.advanceOrderStatus.mockResolvedValue(advancedResponse);

      const dto: AdvanceOrderStatusDto = {
        status: FoodOrderStatus.IN_PREPARATION,
      };
      const result = await controller.advanceOrderStatus(
        sampleGuest,
        'order-101',
        dto,
      );

      expect(result.status).toBe(FoodOrderStatus.IN_PREPARATION);
      expect(mockService.advanceOrderStatus).toHaveBeenCalledWith(
        sampleGuest,
        'order-101',
        FoodOrderStatus.IN_PREPARATION,
      );
    });
  });
});
