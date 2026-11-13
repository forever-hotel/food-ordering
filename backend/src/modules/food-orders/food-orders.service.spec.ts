import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpstreamServiceUnavailableException } from '../../integrations/contracts/upstream-integration.exception.js';
import { MockKmsAdapter } from '../../integrations/internal-services/kms/adapters/mock-kms.adapter.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { HotelClockService } from '../menu/services/hotel-clock.service.js';
import { MealWindowService } from '../menu/services/meal-window.service.js';
import { CreateFoodOrderDto } from './dto/create-food-order.dto.js';
import { FoodOrderStatus } from './enums/food-order-status.enum.js';
import { FossDemoOrder } from './entities/foss-demo-order.entity.js';
import { FoodOrdersService } from './food-orders.service.js';
import { buildFoodOrderTimeline } from './order-response.mapper.js';
import { FossDemoOrderRepository } from './repositories/foss-demo-order.repository.js';

describe('FoodOrdersService', () => {
  let service: FoodOrdersService;
  let mockKms: MockKmsAdapter;
  let clockService: HotelClockService;
  let mealWindowService: MealWindowService;
  let mockConfigService: {
    get: jest.MockedFunction<(key: string) => string | undefined>;
  };
  let mockOrderRepository: {
    findById: jest.MockedFunction<FossDemoOrderRepository['findById']>;
    findByIdempotencyKey: jest.MockedFunction<
      FossDemoOrderRepository['findByIdempotencyKey']
    >;
    findByBookingAndRoom: jest.MockedFunction<
      FossDemoOrderRepository['findByBookingAndRoom']
    >;
    save: jest.MockedFunction<FossDemoOrderRepository['save']>;
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

  beforeEach(() => {
    mockKms = new MockKmsAdapter();
    clockService = new HotelClockService();
    mealWindowService = new MealWindowService(clockService);

    // Set clock to 13:00 Colombo (Lunch and All Day are active)
    clockService.setFixedTime(new Date('2026-10-28T07:30:00.000Z'));

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'DEMO_MODE') return 'true';
        if (key === 'MOCK_EXTERNAL_SERVICES') return 'true';
        return undefined;
      }),
    };

    mockOrderRepository = {
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findByBookingAndRoom: jest.fn(),
      save: jest.fn(async (order: FossDemoOrder) => order),
    };

    service = new FoodOrdersService(
      mockKms,
      mealWindowService,
      clockService,
      mockOrderRepository as unknown as FossDemoOrderRepository,
      mockConfigService as unknown as ConfigService,
    );
  });

  describe('createFoodOrder()', () => {
    const validDto: CreateFoodOrderDto = {
      items: [
        {
          menuItemId: 'menu-item-001', // Truffle Mushroom Arancini (price: 18.00, Lunch)
          quantity: 2,
          specialNotes: 'Extra crispy',
        },
      ],
      allergyNote: 'No peanuts please',
      idempotencyKey: 'idemp-key-test-001',
    };

    it('places order successfully with authoritative pricing and persistence', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);

      const response = await service.createFoodOrder(sampleGuest, validDto);

      expect(response).toBeDefined();
      expect(response.orderId).toMatch(/^order-kms-/);
      expect(response.roomNumber).toBe('101');
      expect(response.bookingId).toBe('booking-uuid-101');
      expect(response.status).toBe(FoodOrderStatus.PLACED);
      expect(response.totalAmount).toBe(36.0); // 18.00 * 2
      expect(response.items.length).toBe(1);
      expect(response.items[0]?.name).toBe('Truffle Mushroom Arancini');
      expect(response.items[0]?.unitPrice).toBe(18.0);
      expect(response.items[0]?.quantity).toBe(2);
      expect(response.items[0]?.specialNotes).toBe('Extra crispy');
      expect(response.allergyNotes).toBe('No peanuts please');
      expect(response.idempotencyKey).toBe('idemp-key-test-001');
      expect(response.canCancel).toBe(true);
      expect(response.secondsRemainingToCancel).toBeGreaterThan(0);
      expect(response.timeline?.length).toBe(4);

      expect(mockOrderRepository.save).toHaveBeenCalledTimes(1);
    });

    it('returns existing order on idempotent retry with the same key without calling KMS', async () => {
      const existingOrder = new FossDemoOrder();
      existingOrder.orderId = 'order-existing-123';
      existingOrder.bookingId = sampleGuest.bookingId;
      existingOrder.roomNumber = sampleGuest.roomNumber;
      existingOrder.status = FoodOrderStatus.PLACED;
      existingOrder.totalAmount = 36.0;
      existingOrder.idempotencyKey = 'idemp-key-test-001';
      existingOrder.estimatedDeliveryMinutes = 25;
      existingOrder.createdAt = new Date('2026-10-28T07:30:00.000Z');
      existingOrder.updatedAt = new Date('2026-10-28T07:30:00.000Z');
      existingOrder.items = [];

      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(existingOrder);

      const createOrderSpy = jest.spyOn(mockKms, 'createOrder');

      const response = await service.createFoodOrder(sampleGuest, validDto);

      expect(response.orderId).toBe('order-existing-123');
      expect(createOrderSpy).not.toHaveBeenCalled();
      expect(mockOrderRepository.save).not.toHaveBeenCalled();
    });

    it('rejects idempotent replay if used by a different room or booking with 403 Forbidden', async () => {
      const foreignOrder = new FossDemoOrder();
      foreignOrder.orderId = 'order-foreign-999';
      foreignOrder.bookingId = 'booking-other-999';
      foreignOrder.roomNumber = '999';
      foreignOrder.idempotencyKey = 'idemp-key-test-001';
      foreignOrder.items = [];

      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(foreignOrder);

      await expect(
        service.createFoodOrder(sampleGuest, validDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if idempotency key is missing', async () => {
      const dtoWithoutKey: CreateFoodOrderDto = {
        items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
      };

      await expect(
        service.createFoodOrder(sampleGuest, dtoWithoutKey, ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if menu item does not exist in catalog', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);

      const badDto: CreateFoodOrderDto = {
        items: [{ menuItemId: 'non-existent-item-id', quantity: 1 }],
        idempotencyKey: 'key-123',
      };

      await expect(
        service.createFoodOrder(sampleGuest, badDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if menu item is sold out / unavailable', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);

      // menu-item-007 (Seasonal Lobster Tail) is fixture available: false
      const soldOutDto: CreateFoodOrderDto = {
        items: [{ menuItemId: 'menu-item-007', quantity: 1 }],
        idempotencyKey: 'key-sold-out',
      };

      await expect(
        service.createFoodOrder(sampleGuest, soldOutDto),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if item meal window cutoff has passed', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);

      // At 13:00 Colombo, Breakfast (cutoff 10:30:00) is closed
      // menu-item-004 (Classic Eggs Benedict) belongs to BREAKFAST
      const breakfastDto: CreateFoodOrderDto = {
        items: [{ menuItemId: 'menu-item-004', quantity: 1 }],
        idempotencyKey: 'key-breakfast-cutoff',
      };

      await expect(
        service.createFoodOrder(sampleGuest, breakfastDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if item quantity is invalid', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);

      const zeroQtyDto: CreateFoodOrderDto = {
        items: [{ menuItemId: 'menu-item-001', quantity: 0 }],
        idempotencyKey: 'key-zero-qty',
      };

      await expect(
        service.createFoodOrder(sampleGuest, zeroQtyDto),
      ).rejects.toThrow(BadRequestException);

      const overLimitDto: CreateFoodOrderDto = {
        items: [{ menuItemId: 'menu-item-001', quantity: 25 }],
        idempotencyKey: 'key-over-qty',
      };

      await expect(
        service.createFoodOrder(sampleGuest, overLimitDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates UpstreamServiceUnavailableException when KMS fails', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);
      mockKms.setSimulateDown(true);

      await expect(
        service.createFoodOrder(sampleGuest, validDto),
      ).rejects.toThrow(UpstreamServiceUnavailableException);
    });

    it('handles concurrent duplicate key race condition gracefully', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValueOnce(null);

      const existingOrder = new FossDemoOrder();
      existingOrder.orderId = 'order-race-winner';
      existingOrder.bookingId = sampleGuest.bookingId;
      existingOrder.roomNumber = sampleGuest.roomNumber;
      existingOrder.status = FoodOrderStatus.PLACED;
      existingOrder.totalAmount = 36.0;
      existingOrder.idempotencyKey = 'idemp-key-test-001';
      existingOrder.createdAt = clockService.now();
      existingOrder.updatedAt = clockService.now();
      existingOrder.items = [];

      mockOrderRepository.save.mockRejectedValueOnce({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      });
      mockOrderRepository.findByIdempotencyKey.mockResolvedValueOnce(
        existingOrder,
      );

      const response = await service.createFoodOrder(sampleGuest, validDto);
      expect(response.orderId).toBe('order-race-winner');
    });
  });

  describe('getGuestOrderById()', () => {
    it('returns order when room and booking match', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-101';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.totalAmount = 50.0;
      order.createdAt = clockService.now();
      order.updatedAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      const result = await service.getGuestOrderById(sampleGuest, 'order-101');
      expect(result.orderId).toBe('order-101');
      expect(result.canCancel).toBe(true);
      expect(result.timeline).toBeDefined();
    });

    it('throws NotFoundException when order does not exist', async () => {
      mockOrderRepository.findById.mockResolvedValue(null);

      await expect(
        service.getGuestOrderById(sampleGuest, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when order belongs to different room', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-999';
      order.bookingId = 'different-booking';
      order.roomNumber = '999';
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      await expect(
        service.getGuestOrderById(sampleGuest, 'order-999'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getGuestOrders()', () => {
    it('returns all orders for current stay', async () => {
      const order1 = new FossDemoOrder();
      order1.orderId = 'order-1';
      order1.bookingId = sampleGuest.bookingId;
      order1.roomNumber = sampleGuest.roomNumber;
      order1.createdAt = clockService.now();
      order1.updatedAt = clockService.now();
      order1.items = [];

      mockOrderRepository.findByBookingAndRoom.mockResolvedValue([order1]);

      const result = await service.getGuestOrders(sampleGuest);
      expect(result.length).toBe(1);
      expect(result[0]?.orderId).toBe('order-1');
    });
  });

  describe('cancelFoodOrder() & 10-Minute Boundary Policy', () => {
    it('cancels placed order successfully within the 10-minute window (e.g., 5 mins elapsed)', async () => {
      const placedTime = new Date('2026-10-28T07:25:00.000Z'); // 5 minutes before 07:30:00
      const order = new FossDemoOrder();
      order.orderId = 'order-to-cancel-001';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.totalAmount = 36.0;
      order.createdAt = placedTime;
      order.updatedAt = placedTime;
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);
      (mockKms as any).orders.set('order-to-cancel-001', {
        orderId: 'order-to-cancel-001',
        roomNumber: sampleGuest.roomNumber,
        bookingId: sampleGuest.bookingId,
        status: FoodOrderStatus.PLACED,
        totalAmount: 36.0,
        createdAt: placedTime.toISOString(),
        updatedAt: placedTime.toISOString(),
        items: [],
      });

      const result = await service.cancelFoodOrder(
        sampleGuest,
        'order-to-cancel-001',
        'Guest changed mind',
      );

      expect(result.status).toBe(FoodOrderStatus.CANCELLED);
      expect(result.canCancel).toBe(false);
      expect(mockOrderRepository.save).toHaveBeenCalled();
    });

    it('allows cancellation at 9 minutes 59 seconds elapsed (within 600s boundary)', async () => {
      const placedTime = new Date('2026-10-28T07:20:01.000Z'); // 599 seconds before 07:30:00
      const order = new FossDemoOrder();
      order.orderId = 'order-boundary-valid';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.totalAmount = 36.0;
      order.createdAt = placedTime;
      order.updatedAt = placedTime;
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);
      (mockKms as any).orders.set('order-boundary-valid', {
        orderId: 'order-boundary-valid',
        roomNumber: sampleGuest.roomNumber,
        bookingId: sampleGuest.bookingId,
        status: FoodOrderStatus.PLACED,
        totalAmount: 36.0,
        createdAt: placedTime.toISOString(),
        updatedAt: placedTime.toISOString(),
        items: [],
      });

      const result = await service.cancelFoodOrder(
        sampleGuest,
        'order-boundary-valid',
      );
      expect(result.status).toBe(FoodOrderStatus.CANCELLED);
    });

    it('rejects cancellation at exactly 10 minutes 00 seconds (600s boundary cutoff)', async () => {
      const placedTime = new Date('2026-10-28T07:20:00.000Z'); // exactly 600 seconds before 07:30:00
      const order = new FossDemoOrder();
      order.orderId = 'order-exact-cutoff';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.totalAmount = 36.0;
      order.createdAt = placedTime;
      order.updatedAt = placedTime;
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-exact-cutoff'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects cancellation after 10 minutes (e.g., 15 mins elapsed)', async () => {
      const placedTime = new Date('2026-10-28T07:15:00.000Z'); // 15 mins before 07:30:00
      const order = new FossDemoOrder();
      order.orderId = 'order-expired-window';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.totalAmount = 36.0;
      order.createdAt = placedTime;
      order.updatedAt = placedTime;
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-expired-window'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects cancellation if order is already IN_PREPARATION', async () => {
      const placedTime = new Date('2026-10-28T07:28:00.000Z'); // only 2 mins ago
      const order = new FossDemoOrder();
      order.orderId = 'order-in-prep';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.IN_PREPARATION;
      order.totalAmount = 36.0;
      order.createdAt = placedTime;
      order.updatedAt = placedTime;
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-in-prep'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects cancellation if order is already DELIVERED', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-delivered';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.DELIVERED;
      order.createdAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-delivered'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects cancellation if order belongs to a different room with 403 Forbidden', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-room-999';
      order.bookingId = 'booking-999';
      order.roomNumber = '999';
      order.status = FoodOrderStatus.PLACED;
      order.createdAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-room-999'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('advanceOrderStatus() [DEMO_MODE]', () => {
    it('rejects status advancement by default when ENABLE_ORDER_DEMO_SIMULATION is unset or false', async () => {
      await expect(
        service.advanceOrderStatus(
          sampleGuest,
          'order-demo-001',
          FoodOrderStatus.READY,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('advances order status when ENABLE_ORDER_DEMO_SIMULATION and DEMO_MODE are explicitly true in test/dev', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_ORDER_DEMO_SIMULATION') return 'true';
        if (key === 'DEMO_MODE') return 'true';
        if (key === 'MOCK_EXTERNAL_SERVICES') return 'true';
        return undefined;
      });

      const order = new FossDemoOrder();
      order.orderId = 'order-demo-001';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.createdAt = clockService.now();
      order.updatedAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);
      (mockKms as any).orders.set('order-demo-001', {
        orderId: 'order-demo-001',
        roomNumber: sampleGuest.roomNumber,
        bookingId: sampleGuest.bookingId,
        status: FoodOrderStatus.PLACED,
        totalAmount: 36.0,
        createdAt: clockService.now().toISOString(),
        updatedAt: clockService.now().toISOString(),
        items: [],
      });

      const result = await service.advanceOrderStatus(
        sampleGuest,
        'order-demo-001',
        FoodOrderStatus.IN_PREPARATION,
      );

      expect(result.status).toBe(FoodOrderStatus.IN_PREPARATION);
      expect(mockOrderRepository.save).toHaveBeenCalled();
    });

    it('rejects status advancement when DEMO_MODE is false with 403 Forbidden', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_ORDER_DEMO_SIMULATION') return 'true';
        if (key === 'DEMO_MODE') return 'false';
        return undefined;
      });

      await expect(
        service.advanceOrderStatus(
          sampleGuest,
          'order-demo-001',
          FoodOrderStatus.READY,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('strictly rejects status advancement when NODE_ENV is production even if flags are true', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_ORDER_DEMO_SIMULATION') return 'true';
        if (key === 'DEMO_MODE') return 'true';
        return undefined;
      });
      process.env.NODE_ENV = 'production';
      try {
        await expect(
          service.advanceOrderStatus(
            sampleGuest,
            'order-demo-001',
            FoodOrderStatus.READY,
          ),
        ).rejects.toThrow(ForbiddenException);
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });

    it('strictly rejects status advancement in staging or when SHARED_DATABASE_MODE is true', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_ORDER_DEMO_SIMULATION') return 'true';
        if (key === 'DEMO_MODE') return 'true';
        if (key === 'DEPLOYMENT_ENV') return 'staging';
        return undefined;
      });

      await expect(
        service.advanceOrderStatus(
          sampleGuest,
          'order-demo-001',
          FoodOrderStatus.READY,
        ),
      ).rejects.toThrow(ForbiddenException);

      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_ORDER_DEMO_SIMULATION') return 'true';
        if (key === 'DEMO_MODE') return 'true';
        if (key === 'SHARED_DATABASE_MODE') return 'true';
        return undefined;
      });

      await expect(
        service.advanceOrderStatus(
          sampleGuest,
          'order-demo-001',
          FoodOrderStatus.READY,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if order to advance does not exist', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_ORDER_DEMO_SIMULATION') return 'true';
        if (key === 'DEMO_MODE') return 'true';
        return undefined;
      });
      mockOrderRepository.findById.mockResolvedValue(null);

      await expect(
        service.advanceOrderStatus(
          sampleGuest,
          'order-not-found',
          FoodOrderStatus.READY,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if order belongs to a different room or booking', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_ORDER_DEMO_SIMULATION') return 'true';
        if (key === 'DEMO_MODE') return 'true';
        return undefined;
      });
      const foreignOrder = new FossDemoOrder();
      foreignOrder.orderId = 'order-foreign';
      foreignOrder.bookingId = 'booking-foreign';
      foreignOrder.roomNumber = '999';

      mockOrderRepository.findById.mockResolvedValue(foreignOrder);

      await expect(
        service.advanceOrderStatus(
          sampleGuest,
          'order-foreign',
          FoodOrderStatus.READY,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sets estimatedDeliveryMinutes to 5 when advanced to READY', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_ORDER_DEMO_SIMULATION') return 'true';
        if (key === 'DEMO_MODE') return 'true';
        return undefined;
      });
      const order = new FossDemoOrder();
      order.orderId = 'order-ready-test';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.IN_PREPARATION;
      order.createdAt = clockService.now();
      order.updatedAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);
      (mockKms as any).orders.set('order-ready-test', {
        orderId: 'order-ready-test',
        status: FoodOrderStatus.IN_PREPARATION,
      });

      const result = await service.advanceOrderStatus(
        sampleGuest,
        'order-ready-test',
        FoodOrderStatus.READY,
      );

      expect(result.status).toBe(FoodOrderStatus.READY);
      expect(result.estimatedDeliveryMinutes).toBe(5);
    });

    it('sets estimatedDeliveryMinutes to 0 when advanced to DELIVERED', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ENABLE_ORDER_DEMO_SIMULATION') return 'true';
        if (key === 'DEMO_MODE') return 'true';
        return undefined;
      });
      const order = new FossDemoOrder();
      order.orderId = 'order-delivered-test';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.READY;
      order.createdAt = clockService.now();
      order.updatedAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);
      (mockKms as any).orders.set('order-delivered-test', {
        orderId: 'order-delivered-test',
        status: FoodOrderStatus.READY,
      });

      const result = await service.advanceOrderStatus(
        sampleGuest,
        'order-delivered-test',
        FoodOrderStatus.DELIVERED,
      );

      expect(result.status).toBe(FoodOrderStatus.DELIVERED);
      expect(result.estimatedDeliveryMinutes).toBe(0);
    });
  });

  describe('Additional Edge Cases & Branch Coverage (DDP-146)', () => {
    it('throws BadRequestException if items array is empty', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);

      await expect(
        service.createFoodOrder(
          sampleGuest,
          { items: [] },
          'idemp-empty-items',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('wraps generic errors from KMS menu catalog in UpstreamServiceUnavailableException', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);
      jest
        .spyOn(mockKms, 'getMenuCatalog')
        .mockRejectedValueOnce(new Error('Connection timed out'));

      await expect(
        service.createFoodOrder(sampleGuest, {
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
          idempotencyKey: 'idemp-kms-err',
        }),
      ).rejects.toThrow(UpstreamServiceUnavailableException);
    });

    it('handles cancelFoodOrder with custom reason and upstream ConflictException', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-to-cancel';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.createdAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);
      jest
        .spyOn(mockKms, 'cancelOrder')
        .mockRejectedValueOnce(
          new Error(
            'Order cannot be cancelled because preparation has already begun',
          ),
        );

      await expect(
        service.cancelFoodOrder(
          sampleGuest,
          'order-to-cancel',
          'Guest requested',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('handles cancelFoodOrder when KMS throws generic upstream error', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-cancel-fail';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.createdAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);
      jest
        .spyOn(mockKms, 'cancelOrder')
        .mockRejectedValueOnce(new Error('KMS socket timeout'));

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-cancel-fail'),
      ).rejects.toThrow(UpstreamServiceUnavailableException);
    });

    it('handles date parsing when order dates are string representations', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-string-dates';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.IN_PREPARATION;
      (order as any).createdAt = '2026-10-28T07:25:00.000Z';
      (order as any).updatedAt = '2026-10-28T07:28:00.000Z';
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      const result = await service.getGuestOrderById(
        sampleGuest,
        'order-string-dates',
      );
      expect(result.createdAt).toBe('2026-10-28T07:25:00.000Z');
      expect(result.updatedAt).toBe('2026-10-28T07:28:00.000Z');
      expect(result.timeline?.length).toBe(4);
    });

    it('handles date parsing when order dates are missing or invalid Date', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-invalid-dates';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.READY;
      (order as any).createdAt = new Date('invalid');
      (order as any).updatedAt = null;
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      const result = await service.getGuestOrderById(
        sampleGuest,
        'order-invalid-dates',
      );
      expect(result.orderId).toBe('order-invalid-dates');
      expect(result.status).toBe(FoodOrderStatus.READY);
    });

    it('rejects cancellation with ConflictException if order is already DELIVERED', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-delivered';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.DELIVERED;
      order.createdAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-delivered'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects cancellation with ConflictException if order is already CANCELLED', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-cancelled';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.CANCELLED;
      order.createdAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-cancelled'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects cancellation with ConflictException if order is READY', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-ready';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.READY;
      order.createdAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-ready'),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows UpstreamServiceUnavailableException when KMS cancel throws it directly', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-upstream-fail';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.createdAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);
      jest
        .spyOn(mockKms, 'cancelOrder')
        .mockRejectedValueOnce(
          new UpstreamServiceUnavailableException(
            'KMS',
            'Downstream connection dropped',
          ),
        );

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-upstream-fail'),
      ).rejects.toThrow(UpstreamServiceUnavailableException);
    });

    it('handles KMS cancel error containing already been delivered as ConflictException', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-delivered-conflict';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.createdAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);
      jest
        .spyOn(mockKms, 'cancelOrder')
        .mockRejectedValueOnce(
          new Error('KMS says order has already been delivered to room'),
        );

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-delivered-conflict'),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows UpstreamServiceUnavailableException when KMS createOrder throws it directly', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);
      jest
        .spyOn(mockKms, 'createOrder')
        .mockRejectedValueOnce(
          new UpstreamServiceUnavailableException(
            'KMS',
            'KMS gateway unavailable',
          ),
        );

      await expect(
        service.createFoodOrder(
          sampleGuest,
          { items: [{ menuItemId: 'menu-item-001', quantity: 1 }] },
          'idemp-kms-direct-err',
        ),
      ).rejects.toThrow(UpstreamServiceUnavailableException);
    });

    it('handles concurrent race condition during save() with duplicate key code 23505', async () => {
      mockOrderRepository.findByIdempotencyKey
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          orderId: 'order-race-winner',
          bookingId: sampleGuest.bookingId,
          roomNumber: sampleGuest.roomNumber,
          status: FoodOrderStatus.PLACED,
          totalAmount: 18,
          items: [],
          createdAt: clockService.now(),
          updatedAt: clockService.now(),
        } as unknown as FossDemoOrder);

      mockOrderRepository.save.mockRejectedValueOnce({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      });

      const res = await service.createFoodOrder(
        sampleGuest,
        { items: [{ menuItemId: 'menu-item-001', quantity: 1 }] },
        'idemp-race-key',
      );

      expect(res.orderId).toBe('order-race-winner');
    });

    it('enforces portionLimit if specified on catalog item', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);
      jest.spyOn(mockKms, 'getMenuCatalog').mockResolvedValueOnce({
        items: [
          {
            id: 'item-portion-limited',
            name: 'Limited Wagyu Steak',
            price: 50,
            available: true,
            mealPeriods: ['LUNCH' as any],
            portionLimit: 2,
          } as any,
        ],
      } as any);

      await expect(
        service.createFoodOrder(
          sampleGuest,
          { items: [{ menuItemId: 'item-portion-limited', quantity: 3 }] },
          'idemp-portion-test',
        ),
      ).rejects.toThrow('Requested quantity exceeds the kitchen portion limit');
    });

    it('evaluates orderingWindow when defined on catalog item', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);
      jest.spyOn(mockKms, 'getMenuCatalog').mockResolvedValueOnce({
        items: [
          {
            id: 'item-windowed',
            name: 'Late Night Ramen',
            price: 15,
            available: true,
            orderingWindow: {
              startTime: '22:00:00',
              endTime: '02:00:00',
              cutoffTime: '01:30:00',
              enabled: true,
            },
          } as any,
        ],
      } as any);

      // Current fixed time is 13:00 Colombo, so Late Night Ramen is closed
      await expect(
        service.createFoodOrder(
          sampleGuest,
          { items: [{ menuItemId: 'item-windowed', quantity: 1 }] },
          'idemp-window-test',
        ),
      ).rejects.toThrow(
        "Ordering for 'Late Night Ramen' is closed. The meal window cutoff has passed.",
      );
    });

    it('validates idempotency replay consistency when SHARED_DATABASE_MODE=true', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SHARED_DATABASE_MODE') return 'true';
        if (key === 'DEMO_MODE') return 'true';
        return undefined;
      });

      const existingOrder = new FossDemoOrder();
      existingOrder.orderId = 'order-shared-db';
      existingOrder.roomNumber = sampleGuest.roomNumber;
      existingOrder.bookingId = sampleGuest.bookingId;
      existingOrder.status = FoodOrderStatus.PLACED;
      existingOrder.totalAmount = 36;
      existingOrder.allergyNotes = 'No peanuts';
      existingOrder.items = [
        {
          orderId: 'order-shared-db',
          menuItemId: 'menu-item-001',
          name: 'Item 1',
          quantity: 2,
          unitPrice: 18,
          specialNotes: 'Extra spicy',
        } as any,
      ];
      existingOrder.createdAt = clockService.now();
      existingOrder.updatedAt = clockService.now();
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(existingOrder);

      // Replay with different items throws ConflictException
      await expect(
        service.createFoodOrder(
          sampleGuest,
          {
            items: [{ menuItemId: 'menu-item-002', quantity: 1 }],
            allergyNote: 'No peanuts',
          },
          'idemp-shared-db',
        ),
      ).rejects.toThrow('Idempotency key was used for a different order');

      // Replay with identical items succeeds
      const result = await service.createFoodOrder(
        sampleGuest,
        {
          items: [
            {
              menuItemId: 'menu-item-001',
              quantity: 2,
              specialNotes: 'Extra spicy',
            },
          ],
          allergyNote: 'No peanuts',
        },
        'idemp-shared-db',
      );
      expect(result.orderId).toBe('order-shared-db');
    });

    it('handles KMS cancel error containing preparation has already begun as ConflictException', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-prep-conflict';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.createdAt = clockService.now().toISOString() as any; // String createdAt
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);
      jest
        .spyOn(mockKms, 'cancelOrder')
        .mockRejectedValueOnce(
          new Error('KMS says preparation has already begun in kitchen'),
        );

      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-prep-conflict'),
      ).rejects.toThrow(ConflictException);
    });

    it('handles invalid date strings and missing dates in mapToResponse gracefully', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-invalid-dates';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.createdAt = 'not-a-valid-date' as any;
      order.updatedAt = undefined as any;
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      const res = await service.getGuestOrderById(
        sampleGuest,
        'order-invalid-dates',
      );
      expect(res.orderId).toBe('order-invalid-dates');
      expect(res.createdAt).toBeDefined();
      expect(res.updatedAt).toBeDefined();
    });

    it('handles KMS createOrder exceptions (BadRequest, Conflict, NotFound, non-Error)', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValue(null);
      const dto: CreateFoodOrderDto = {
        items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        idempotencyKey: 'idemp-kms-exceptions',
      };

      jest
        .spyOn(mockKms, 'createOrder')
        .mockRejectedValueOnce(new BadRequestException('Invalid item'));
      await expect(service.createFoodOrder(sampleGuest, dto)).rejects.toThrow(
        BadRequestException,
      );

      jest
        .spyOn(mockKms, 'createOrder')
        .mockRejectedValueOnce(new ConflictException('Slot full'));
      await expect(service.createFoodOrder(sampleGuest, dto)).rejects.toThrow(
        ConflictException,
      );

      jest
        .spyOn(mockKms, 'createOrder')
        .mockRejectedValueOnce(new NotFoundException('Item missing'));
      await expect(service.createFoodOrder(sampleGuest, dto)).rejects.toThrow(
        NotFoundException,
      );

      jest
        .spyOn(mockKms, 'createOrder')
        .mockRejectedValueOnce('raw string error');
      await expect(service.createFoodOrder(sampleGuest, dto)).rejects.toThrow(
        UpstreamServiceUnavailableException,
      );
    });

    it('handles race conditions on order save duplicate key', async () => {
      mockOrderRepository.findByIdempotencyKey.mockResolvedValueOnce(null);
      const existingOrder = new FossDemoOrder();
      existingOrder.orderId = 'order-race-resolved';
      existingOrder.bookingId = sampleGuest.bookingId;
      existingOrder.roomNumber = sampleGuest.roomNumber;
      existingOrder.status = FoodOrderStatus.PLACED;
      existingOrder.createdAt = new Date();
      existingOrder.updatedAt = new Date();
      existingOrder.items = [];

      mockOrderRepository.save.mockRejectedValueOnce({ code: '23505' });
      mockOrderRepository.findByIdempotencyKey.mockResolvedValueOnce(
        existingOrder,
      );

      const res1 = await service.createFoodOrder(sampleGuest, {
        items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        idempotencyKey: 'race-key-1',
      });
      expect(res1.orderId).toBe('order-race-resolved');

      // duplicate key message
      mockOrderRepository.findByIdempotencyKey.mockResolvedValueOnce(null);
      mockOrderRepository.save.mockRejectedValueOnce({
        message: 'duplicate key value violates unique constraint',
      });
      mockOrderRepository.findByIdempotencyKey.mockResolvedValueOnce(
        existingOrder,
      );

      const res2 = await service.createFoodOrder(sampleGuest, {
        items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
        idempotencyKey: 'race-key-2',
      });
      expect(res2.orderId).toBe('order-race-resolved');

      // UNIQUE constraint failed with no existing found -> rethrows
      mockOrderRepository.findByIdempotencyKey.mockResolvedValueOnce(null);
      mockOrderRepository.save.mockRejectedValueOnce({
        message: 'UNIQUE constraint failed',
      });
      mockOrderRepository.findByIdempotencyKey.mockResolvedValueOnce(null);

      await expect(
        service.createFoodOrder(sampleGuest, {
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
          idempotencyKey: 'race-key-3',
        }),
      ).rejects.toEqual({ message: 'UNIQUE constraint failed' });

      // Other generic error -> rethrows
      mockOrderRepository.findByIdempotencyKey.mockResolvedValueOnce(null);
      mockOrderRepository.save.mockRejectedValueOnce(new Error('DB disk full'));
      await expect(
        service.createFoodOrder(sampleGuest, {
          items: [{ menuItemId: 'menu-item-001', quantity: 1 }],
          idempotencyKey: 'race-key-4',
        }),
      ).rejects.toThrow('DB disk full');
    });

    it('handles KMS cancelOrder exceptions (BadRequest, NotFound, delivered, non-Error)', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-cancel-branch';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.createdAt = clockService.now();
      order.items = [];

      mockOrderRepository.findById.mockResolvedValue(order);

      jest
        .spyOn(mockKms, 'cancelOrder')
        .mockRejectedValueOnce(new BadRequestException('Cannot cancel'));
      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-cancel-branch'),
      ).rejects.toThrow(BadRequestException);

      jest
        .spyOn(mockKms, 'cancelOrder')
        .mockRejectedValueOnce(new NotFoundException('Order not in KMS'));
      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-cancel-branch'),
      ).rejects.toThrow(NotFoundException);

      jest
        .spyOn(mockKms, 'cancelOrder')
        .mockRejectedValueOnce(
          new Error('Order has already been delivered to room'),
        );
      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-cancel-branch'),
      ).rejects.toThrow(ConflictException);

      jest
        .spyOn(mockKms, 'cancelOrder')
        .mockRejectedValueOnce('raw cancel error');
      await expect(
        service.cancelFoodOrder(sampleGuest, 'order-cancel-branch'),
      ).rejects.toThrow(UpstreamServiceUnavailableException);
    });

    it('exercises buildTimeline fallbacks with missing or unparsed date properties', async () => {
      const order = new FossDemoOrder();
      order.orderId = 'order-timeline-fallbacks';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.createdAt = undefined as any;
      order.updatedAt = '2026-10-28T07:30:00.000Z' as any;
      order.items = null as any;

      const timeline = buildFoodOrderTimeline(order, clockService.now());
      expect(timeline).toBeDefined();
      expect(timeline.length).toBeGreaterThan(0);

      order.createdAt = clockService.now();
      order.updatedAt = undefined as any;
      const timeline2 = buildFoodOrderTimeline(order, clockService.now());
      expect(timeline2).toBeDefined();
    });
  });
});
