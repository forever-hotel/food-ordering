import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
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
    totalAmount: 29.0,
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
});
