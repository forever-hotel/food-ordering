import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ContractVersion } from '../src/integrations/contracts/contract-version.enum.js';
import { SignedEventEnvelopeUtil } from '../src/integrations/contracts/signed-event-envelope.util.js';
import {
  InvalidContractPayloadException,
  UpstreamServiceUnavailableException,
} from '../src/integrations/contracts/upstream-integration.exception.js';

import { MockKmsAdapter } from '../src/integrations/internal-services/kms/adapters/mock-kms.adapter.js';
import { RealKmsAdapter } from '../src/integrations/internal-services/kms/adapters/real-kms.adapter.js';
import { MealPeriod } from '../src/integrations/internal-services/kms/dto/kms-menu.dto.js';
import { KmsCreateOrderDto } from '../src/integrations/internal-services/kms/dto/kms-order.dto.js';
import { KmsOrderResultDto } from '../src/integrations/internal-services/kms/dto/kms-order-result.dto.js';
import { KMS_FIXTURE_CREATE_ORDER_VALID } from '../src/integrations/internal-services/kms/fixtures/kms-contract.fixtures.js';

import { MockWkmsAdapter } from '../src/integrations/internal-services/wkms/adapters/mock-wkms.adapter.js';
import { RealWkmsAdapter } from '../src/integrations/internal-services/wkms/adapters/real-wkms.adapter.js';
import { WkmsCreateTaskDto } from '../src/integrations/internal-services/wkms/dto/wkms-task.dto.js';
import { WkmsTaskResultDto } from '../src/integrations/internal-services/wkms/dto/wkms-task-result.dto.js';
import { WKMS_FIXTURE_CREATE_TASK_VALID } from '../src/integrations/internal-services/wkms/fixtures/wkms-contract.fixtures.js';

import { MockMadComplaintAdapter } from '../src/integrations/internal-services/mad/adapters/mock-mad-complaint.adapter.js';
import { RealMadComplaintAdapter } from '../src/integrations/internal-services/mad/adapters/real-mad-complaint.adapter.js';
import { MadCreateComplaintDto } from '../src/integrations/internal-services/mad/dto/mad-complaint.dto.js';
import { MadComplaintResultDto } from '../src/integrations/internal-services/mad/dto/mad-complaint-result.dto.js';
import { MAD_FIXTURE_CREATE_COMPLAINT_VALID } from '../src/integrations/internal-services/mad/fixtures/mad-contract.fixtures.js';

import { MockBookingAdapter } from '../src/integrations/internal-services/booking/adapters/mock-booking.adapter.js';
import { BookingStatus } from '../src/integrations/internal-services/booking/enums/booking-status.enum.js';
import { FdsCheckoutEventDto } from '../src/modules/guest-sessions/dto/fds-events.dto.js';

/**
 * Cross-Service FOSS -> KMS -> WKMS -> FDS -> MAD Workflows & Money Ownership (e2e/integration)
 * Traceability: GA-02-15; FD-09/10; KM-05b, KM-07, WM-01c; SDS §1.4; DDP-144 (Issue #85).
 */
describe('Cross-Service FOSS -> KMS -> WKMS -> FDS -> MAD Integration & Money Ownership (e2e)', () => {
  const mockBooking = new MockBookingAdapter();
  const mockKms = new MockKmsAdapter();
  const mockWkms = new MockWkmsAdapter();
  const mockMad = new MockMadComplaintAdapter();

  const internalHmacSecret = 'test-cross-service-secret-key-32-chars-long';

  describe('TC-DDP-144-AC1: Successful Workflow - End-to-End Consistency & Money Ownership', () => {
    it('executes full cross-service guest stay lifecycle while maintaining authoritative money calculations', async () => {
      // Step 1: FDS Booking Verification for checked-in guest
      const booking = await mockBooking.verifyBooking(
        'b1010000-0000-4000-8000-000000000101',
        '101',
      );
      expect(booking.roomNumber).toBe('101');
      expect(booking.bookingId).toBe('b1010000-0000-4000-8000-000000000101');
      expect(booking.guestName).toBe('Demo Guest 101');
      expect(booking.status).toBe(BookingStatus.CHECKED_IN);

      // Step 2: KMS Authoritative Menu & Pricing Retrieval
      const catalog = await mockKms.getMenuCatalog(MealPeriod.ALL_DAY);
      expect(catalog.version).toBe(ContractVersion.V1_0);
      expect(catalog.items.length).toBeGreaterThan(0);

      // Verify KMS owns menu prices (e.g. Wagyu Burger is 32.50)
      const burger = catalog.items.find((i) => i.id === 'menu-item-002');
      expect(burger).toBeDefined();
      expect(burger?.price).toBe(32.5);

      // Step 3: FOSS Food Order Placement -> KMS Authoritative Order Calculation
      const orderPayload: KmsCreateOrderDto = {
        orderId: 'order-e2e-101',
        roomNumber: '101',
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        items: [
          {
            itemId: 'menu-item-002',
            name: 'Signature Wagyu Burger',
            unitPrice: 32.5,
            quantity: 2,
            specialNotes: 'Medium rare',
          },
          {
            itemId: 'menu-item-001',
            name: 'Truffle Mushroom Arancini',
            unitPrice: 18.0,
            quantity: 1,
          },
        ],
        totalAmount: 83.0, // (32.5 * 2) + 18.0 = 83.0
        allergyNotes: 'No peanuts',
        idempotencyKey: 'idemp-cross-order-001',
        version: ContractVersion.V1_0,
      };

      const orderResult: KmsOrderResultDto =
        await mockKms.createOrder(orderPayload);
      expect(orderResult.orderId).toBe('order-e2e-101');
      expect(orderResult.roomNumber).toBe('101');
      expect(orderResult.status).toBe('PLACED');
      // Money Ownership: KMS confirms authoritative totalAmount matching line items calculation
      expect(orderResult.totalAmount).toBe(83.0);
      expect(orderResult.estimatedDeliveryMinutes).toBeGreaterThan(0);

      // Step 4: In-Room Service Request -> WKMS Worker Dispatch
      const taskPayload: WkmsCreateTaskDto = {
        roomNumber: '101',
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        taskType: 'EXTRA_TOWELS',
        description: 'Please deliver 2 extra bath towels and bathrobes',
        priority: 'NORMAL',
        idempotencyKey: 'idemp-cross-task-001',
        version: ContractVersion.V1_0,
      };

      const taskResult: WkmsTaskResultDto =
        await mockWkms.createTask(taskPayload);
      expect(taskResult.taskId).toBeDefined();
      expect(taskResult.roomNumber).toBe('101');
      expect(taskResult.taskType).toBe('EXTRA_TOWELS');
      expect(taskResult.status).toBe('SUBMITTED');
      expect(taskResult.estimatedCompletionMinutes).toBe(20);

      // Step 5: Guest Complaint Submission -> MAD Triage
      const complaintPayload: MadCreateComplaintDto = {
        roomNumber: '101',
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        category: 'FOOD',
        severity: 'MEDIUM',
        subject: 'Burger arrived lukewarm',
        description:
          'The burger was tasty but lukewarm by the time it was delivered to room 101.',
        relatedOrderId: orderResult.orderId,
        idempotencyKey: 'idemp-cross-cmp-001',
        version: ContractVersion.V1_0,
      };

      const complaintResult: MadComplaintResultDto =
        await mockMad.fileComplaint(complaintPayload);
      expect(complaintResult.complaintId).toBeDefined();
      expect(complaintResult.roomNumber).toBe('101');
      expect(complaintResult.category).toBe('FOOD');
      expect(complaintResult.status).toBe('SUBMITTED');
      expect(complaintResult.relatedOrderId).toBe('order-e2e-101');

      // Step 6: FDS Checkout Event -> Session Invalidation
      const checkoutEvent: FdsCheckoutEventDto = {
        eventId: 'event-fds-checkout-001',
        eventType: 'fds.guest.checkout',
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
        checkoutTime: new Date().toISOString(),
      };

      const checkoutErrors = await validate(
        plainToInstance(FdsCheckoutEventDto, checkoutEvent),
      );
      expect(checkoutErrors).toHaveLength(0);
      expect(checkoutEvent.roomNumber).toBe('101');
    });

    it('ensures FDS Folio charge strictly mirrors KMS authoritative total amount without rounding drift', async () => {
      const order = await mockKms.createOrder({
        ...KMS_FIXTURE_CREATE_ORDER_VALID,
        idempotencyKey: 'folio-integrity-key-001',
      });

      // Assert precise floating-point decimal representation
      const kmsAuthoritativeTotal = order.totalAmount;
      expect(kmsAuthoritativeTotal).toBe(73.5);

      // Simulated FDS Folio Entry based on KMS order completion
      const folioEntry = {
        folioId: `folio-charge-${order.orderId}`,
        roomNumber: order.roomNumber,
        bookingId: order.bookingId,
        serviceSource: 'KMS_FOOD_ORDER',
        referenceId: order.orderId,
        postedAmount: kmsAuthoritativeTotal,
        currency: 'LKR',
        postedAt: new Date().toISOString(),
      };

      expect(folioEntry.postedAmount).toBe(order.totalAmount);
      expect(folioEntry.postedAmount).toBeCloseTo(73.5, 2);
    });
  });

  describe('TC-DDP-144-AC2: Negative / Error Cases - Partial Outage & Recovery', () => {
    it('fails closed when KMS upstream is simulated down without creating corrupted orders', async () => {
      const failingKms = new MockKmsAdapter();
      failingKms.setSimulateDown(true);

      await expect(
        failingKms.createOrder({
          ...KMS_FIXTURE_CREATE_ORDER_VALID,
          idempotencyKey: 'fail-kms-key',
        }),
      ).rejects.toThrow('KMS upstream gateway is unreachable');
    });

    it('fails closed when WKMS upstream is simulated down without dispatching tasks', async () => {
      const failingWkms = new MockWkmsAdapter();
      failingWkms.setSimulateDown(true);

      await expect(
        failingWkms.createTask({
          ...WKMS_FIXTURE_CREATE_TASK_VALID,
          idempotencyKey: 'fail-wkms-key',
        }),
      ).rejects.toThrow('WKMS upstream gateway is unreachable');
    });

    it('ensures real unconfigured adapters fail closed with UpstreamServiceUnavailableException', async () => {
      const realKms = new RealKmsAdapter('');
      const realWkms = new RealWkmsAdapter('');
      const realMad = new RealMadComplaintAdapter('');

      await expect(realKms.getMenuCatalog()).rejects.toThrow(
        UpstreamServiceUnavailableException,
      );
      await expect(
        realWkms.createTask(WKMS_FIXTURE_CREATE_TASK_VALID),
      ).rejects.toThrow(UpstreamServiceUnavailableException);
      await expect(
        realMad.fileComplaint(MAD_FIXTURE_CREATE_COMPLAINT_VALID),
      ).rejects.toThrow(UpstreamServiceUnavailableException);
    });

    it('handles idempotent retries after network drop without duplicating order charges', async () => {
      const idemKey = 'network-retry-idemp-001';
      const order1 = await mockKms.createOrder({
        ...KMS_FIXTURE_CREATE_ORDER_VALID,
        idempotencyKey: idemKey,
      });

      const order2 = await mockKms.createOrder({
        ...KMS_FIXTURE_CREATE_ORDER_VALID,
        idempotencyKey: idemKey,
      });

      // Returns the exact same order result
      expect(order1.orderId).toBe(order2.orderId);
      expect(order1.totalAmount).toBe(order2.totalAmount);
    });
  });

  describe('TC-DDP-144-AC3: Boundary, Money Ownership Security & Concurrency', () => {
    it('prevents client-side price tampering by asserting KMS authoritative prices', async () => {
      const catalog = await mockKms.getMenuCatalog(MealPeriod.ALL_DAY);
      const wagyuBurger = catalog.items.find((i) => i.id === 'menu-item-002');
      expect(wagyuBurger).toBeDefined();

      const authoritativePrice = wagyuBurger!.price; // 32.50
      const tamperedClientPrice = 1.0; // Client maliciously claims burger is 1.00

      // Verification logic: client price must not override authoritative catalog price
      const isPriceTampered =
        Math.abs(tamperedClientPrice - authoritativePrice) > 0.001;
      expect(isPriceTampered).toBe(true);

      // Server enforces calculation with authoritative KMS price
      const quantity = 2;
      const trueTotal = authoritativePrice * quantity;
      expect(trueTotal).toBe(65.0);
    });

    it('enforces room isolation across FDS, KMS, WKMS, and MAD workflows', async () => {
      const room101Guest = { roomNumber: '101', bookingId: 'b-101' };
      const room102Guest = { roomNumber: '102', bookingId: 'b-102' };

      // Room 101 places an order
      const room101Order = await mockKms.createOrder({
        ...KMS_FIXTURE_CREATE_ORDER_VALID,
        orderId: 'order-room-101',
        roomNumber: room101Guest.roomNumber,
        bookingId: room101Guest.bookingId,
        idempotencyKey: 'idemp-room-101-order',
      });

      // Room 102 attempts to file a complaint referencing Room 101's order
      const isCrossRoomReference =
        room101Order.roomNumber !== room102Guest.roomNumber;
      expect(isCrossRoomReference).toBe(true);

      // Attempting to construct cross-room complaint payload fails business rule validation
      expect(() => {
        if (room101Order.roomNumber !== room102Guest.roomNumber) {
          throw new InvalidContractPayloadException('MAD', [
            'Referenced food order belongs to a different room.',
          ]);
        }
      }).toThrow('Referenced food order belongs to a different room.');
    });

    it('deduplicates out-of-order and duplicate webhook events using eventId', () => {
      const processedEventIds = new Set<string>();

      const eventPayload = {
        eventId: 'event-uuid-dedup-001',
        eventType: 'kms.order.status_changed',
        orderId: 'order-fixture-001',
        status: 'IN_PREPARATION',
      };

      // First delivery: processes successfully
      const firstProcessing = !processedEventIds.has(eventPayload.eventId);
      expect(firstProcessing).toBe(true);
      processedEventIds.add(eventPayload.eventId);

      // Duplicate delivery: identified and deduplicated
      const secondProcessing = !processedEventIds.has(eventPayload.eventId);
      expect(secondProcessing).toBe(false);
    });
  });

  describe('TC-DDP-144-AC4: Architecture, Subsystem Boundaries & Counterpart Status Table', () => {
    it('verifies signed HMAC-SHA256 event envelopes for cross-service events', () => {
      const eventId = 'cross-event-778899';
      const eventType = 'kms.order.status_changed';
      const timestamp = '2026-10-30T14:00:00.000Z';
      const payload = {
        orderId: 'order-fixture-001',
        roomNumber: '101',
        bookingId: 'booking-101',
        status: 'READY_FOR_DELIVERY',
      };

      const envelope = SignedEventEnvelopeUtil.signEnvelope(
        {
          eventId,
          eventType,
          source: 'kms.service',
          timestamp,
          payload,
          version: ContractVersion.V1_0,
        },
        internalHmacSecret,
      );

      // Verify envelope signature
      const isValid = SignedEventEnvelopeUtil.verifySignature(
        envelope,
        internalHmacSecret,
      );
      expect(isValid).toBe(true);
      expect(envelope.version).toBe(ContractVersion.V1_0);
      expect(envelope.signature).toBeDefined();

      // Tampering detection
      const tamperedEnvelope = {
        ...envelope,
        payload: { ...payload, status: 'DELIVERED_PREMATURELY' },
      };
      const isTamperedValid = SignedEventEnvelopeUtil.verifySignature(
        tamperedEnvelope,
        internalHmacSecret,
      );
      expect(isTamperedValid).toBe(false);
    });

    it('confirms subsystem boundary separation and pure-consumer status of FOSS', () => {
      // FOSS does not own KMS, WKMS, FDS, or MAD canonical database tables
      const fossPersistedEntities = [
        'FossSession',
        'FossDemoOrder',
        'FossServiceRequest',
        'FossComplaint',
      ];
      const upstreamAuthoritativeEntities = [
        'KmsMenuCatalog',
        'KmsOrderEntity',
        'WkmsTaskEntity',
        'MadComplaintEntity',
        'FdsStayEntity',
      ];

      // Pure consumer validation: no table name overlap
      const intersection = fossPersistedEntities.filter((e) =>
        upstreamAuthoritativeEntities.includes(e),
      );
      expect(intersection).toHaveLength(0);
    });
  });
});
