import { describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockKmsAdapter } from '../../../integrations/internal-services/kms/adapters/mock-kms.adapter.js';
import { RealKmsAdapter } from '../../../integrations/internal-services/kms/adapters/real-kms.adapter.js';
import type { GuestContext } from '../../guest-sessions/interfaces/guest-context.interface.js';
import { HotelClockService } from '../../menu/services/hotel-clock.service.js';
import { FoodOrderStatus } from '../enums/food-order-status.enum.js';
import { FossDemoOrder } from '../entities/foss-demo-order.entity.js';
import { FossDemoOrderRepository } from '../repositories/foss-demo-order.repository.js';
import { SharedFoodOrderRepository } from '../repositories/shared-food-order.repository.js';
import { OrderDemoSimulationGuard } from './order-demo-simulation.guard.js';
import {
  assertOrderDemoSimulationEnabled,
  isOrderDemoSimulationEnabled,
} from './order-demo-simulation.policy.js';
import { OrderDemoSimulationService } from './order-demo-simulation.service.js';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('Order Demo Simulation Isolation', () => {
  const sampleGuest: GuestContext = {
    sessionId: 'session-101',
    bookingId: 'booking-101',
    guestId: 'guest-101',
    roomNumber: '101',
    guestName: 'Jane Doe',
    stayStart: new Date(),
    stayEnd: new Date(Date.now() + 86400000),
    role: 'GUEST',
  };

  describe('Policy & Guard', () => {
    it('is disabled by default when ENABLE_ORDER_DEMO_SIMULATION is unset or false', () => {
      expect(
        isOrderDemoSimulationEnabled(
          makeConfig({ NODE_ENV: 'development', DEMO_MODE: 'true' }),
        ),
      ).toBe(false);

      expect(
        isOrderDemoSimulationEnabled(
          makeConfig({
            NODE_ENV: 'development',
            DEMO_MODE: 'true',
            ENABLE_ORDER_DEMO_SIMULATION: 'false',
          }),
        ),
      ).toBe(false);
    });

    it('cannot be enabled in production or staging even when flags are true', () => {
      for (const env of ['production', 'staging']) {
        const cfg = makeConfig({
          NODE_ENV: env,
          DEMO_MODE: 'true',
          ENABLE_ORDER_DEMO_SIMULATION: 'true',
        });
        expect(isOrderDemoSimulationEnabled(cfg)).toBe(false);
        expect(() => assertOrderDemoSimulationEnabled(cfg)).toThrow(
          ForbiddenException,
        );
      }

      for (const deployEnv of ['production', 'prod', 'staging', 'stage']) {
        const cfg = makeConfig({
          NODE_ENV: 'development',
          DEPLOYMENT_ENV: deployEnv,
          DEMO_MODE: 'true',
          ENABLE_ORDER_DEMO_SIMULATION: 'true',
        });
        expect(isOrderDemoSimulationEnabled(cfg)).toBe(false);
      }
    });

    it('is enabled only in development/test when explicitly enabled and not in shared DB mode', () => {
      const devCfg = makeConfig({
        NODE_ENV: 'development',
        DEMO_MODE: 'true',
        ENABLE_ORDER_DEMO_SIMULATION: 'true',
      });
      expect(isOrderDemoSimulationEnabled(devCfg)).toBe(true);

      const sharedCfg = makeConfig({
        NODE_ENV: 'development',
        DEMO_MODE: 'true',
        ENABLE_ORDER_DEMO_SIMULATION: 'true',
        SHARED_DATABASE_MODE: 'true',
      });
      expect(isOrderDemoSimulationEnabled(sharedCfg)).toBe(false);
    });

    it('OrderDemoSimulationGuard blocks requests when disabled and allows when authorized', () => {
      const ctx = {} as ExecutionContext;

      const blockedGuard = new OrderDemoSimulationGuard(
        makeConfig({
          NODE_ENV: 'production',
          ENABLE_ORDER_DEMO_SIMULATION: 'true',
          DEMO_MODE: 'true',
        }),
      );
      expect(() => blockedGuard.canActivate(ctx)).toThrow(ForbiddenException);

      const defaultDevGuard = new OrderDemoSimulationGuard(
        makeConfig({ NODE_ENV: 'development', DEMO_MODE: 'true' }),
      );
      expect(() => defaultDevGuard.canActivate(ctx)).toThrow(
        ForbiddenException,
      );

      const enabledDevGuard = new OrderDemoSimulationGuard(
        makeConfig({
          NODE_ENV: 'development',
          DEMO_MODE: 'true',
          ENABLE_ORDER_DEMO_SIMULATION: 'true',
        }),
      );
      expect(enabledDevGuard.canActivate(ctx)).toBe(true);
    });
  });

  describe('OrderDemoSimulationService Safety', () => {
    it('blocks execution against SharedFoodOrderRepository even if flags are enabled', async () => {
      const sharedRepo = new SharedFoodOrderRepository({
        query: jest.fn(),
      } as any);
      const service = new OrderDemoSimulationService(
        new MockKmsAdapter(),
        new HotelClockService(),
        sharedRepo,
        makeConfig({
          NODE_ENV: 'development',
          DEMO_MODE: 'true',
          ENABLE_ORDER_DEMO_SIMULATION: 'true',
        }),
      );

      await expect(
        service.advanceOrderStatus(
          sampleGuest,
          'order-1',
          FoodOrderStatus.READY,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('fails closed if RealKmsAdapter is wired', async () => {
      const repo = new FossDemoOrderRepository();
      const order = new FossDemoOrder();
      order.orderId = 'order-real-1';
      order.bookingId = sampleGuest.bookingId;
      order.roomNumber = sampleGuest.roomNumber;
      order.status = FoodOrderStatus.PLACED;
      order.totalAmount = 1500;
      order.idempotencyKey = 'idemp-1';
      order.createdAt = new Date();
      order.updatedAt = new Date();
      order.items = [];
      await repo.save(order);

      const realKms = new RealKmsAdapter(
        'https://kms.internal.foreverhotel.com',
        'super-secret-api-key-with-at-least-32-chars',
      );
      const service = new OrderDemoSimulationService(
        realKms,
        new HotelClockService(),
        repo,
        makeConfig({
          NODE_ENV: 'development',
          DEMO_MODE: 'true',
          ENABLE_ORDER_DEMO_SIMULATION: 'true',
        }),
      );

      await expect(
        service.advanceOrderStatus(
          sampleGuest,
          'order-real-1',
          FoodOrderStatus.READY,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
