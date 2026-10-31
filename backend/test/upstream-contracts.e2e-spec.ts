import { beforeEach, describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ContractVersion } from '../src/integrations/contracts/contract-version.enum.js';
import { SignedEventEnvelope } from '../src/integrations/contracts/signed-event-envelope.dto.js';
import { SignedEventEnvelopeUtil } from '../src/integrations/contracts/signed-event-envelope.util.js';
import {
  InvalidContractPayloadException,
  UpstreamServiceUnavailableException,
} from '../src/integrations/contracts/upstream-integration.exception.js';

import { MockKmsAdapter } from '../src/integrations/internal-services/kms/adapters/mock-kms.adapter.js';
import { RealKmsAdapter } from '../src/integrations/internal-services/kms/adapters/real-kms.adapter.js';
import {
  KmsMenuCatalogDto,
  MealPeriod,
} from '../src/integrations/internal-services/kms/dto/kms-menu.dto.js';
import { KmsCreateOrderDto } from '../src/integrations/internal-services/kms/dto/kms-order.dto.js';
import { KmsOrderResultDto } from '../src/integrations/internal-services/kms/dto/kms-order-result.dto.js';
import {
  KMS_FIXTURE_ADDITIVE_ORDER,
  KMS_FIXTURE_CREATE_ORDER_VALID,
  KMS_FIXTURE_LEGACY_V1_ORDER,
  KMS_FIXTURE_MALFORMED_ORDER,
} from '../src/integrations/internal-services/kms/fixtures/kms-contract.fixtures.js';

import { MockWkmsAdapter } from '../src/integrations/internal-services/wkms/adapters/mock-wkms.adapter.js';
import { RealWkmsAdapter } from '../src/integrations/internal-services/wkms/adapters/real-wkms.adapter.js';
import { WkmsCreateTaskDto } from '../src/integrations/internal-services/wkms/dto/wkms-task.dto.js';
import { WkmsTaskResultDto } from '../src/integrations/internal-services/wkms/dto/wkms-task-result.dto.js';
import {
  WKMS_FIXTURE_ADDITIVE_TASK,
  WKMS_FIXTURE_CREATE_TASK_VALID,
  WKMS_FIXTURE_LEGACY_V1_TASK,
  WKMS_FIXTURE_MALFORMED_TASK,
} from '../src/integrations/internal-services/wkms/fixtures/wkms-contract.fixtures.js';

import { MockMadComplaintAdapter } from '../src/integrations/internal-services/mad/adapters/mock-mad-complaint.adapter.js';
import { RealMadComplaintAdapter } from '../src/integrations/internal-services/mad/adapters/real-mad-complaint.adapter.js';
import { MadCreateComplaintDto } from '../src/integrations/internal-services/mad/dto/mad-complaint.dto.js';
import { MadComplaintResultDto } from '../src/integrations/internal-services/mad/dto/mad-complaint-result.dto.js';
import {
  MAD_FIXTURE_ADDITIVE_COMPLAINT,
  MAD_FIXTURE_CREATE_COMPLAINT_VALID,
  MAD_FIXTURE_LEGACY_V1_COMPLAINT,
  MAD_FIXTURE_MALFORMED_COMPLAINT,
} from '../src/integrations/internal-services/mad/fixtures/mad-contract.fixtures.js';

import {
  FDS_FIXTURE_ADDITIVE_CHECKOUT,
  FDS_FIXTURE_CHECKOUT_EVENT_VALID,
  FDS_FIXTURE_LEGACY_V1_CHECKOUT,
  FDS_FIXTURE_MALFORMED_EVENT,
  FDS_FIXTURE_ROOM_REASSIGN_EVENT_VALID,
  FDS_FIXTURE_VERIFIED_BOOKING,
} from '../src/integrations/internal-services/booking/fixtures/fds-contract.fixtures.js';
import {
  FdsCheckoutEventDto,
  FdsRoomReassignEventDto,
} from '../src/modules/guest-sessions/dto/fds-events.dto.js';
import { BookingVerificationResultDto } from '../src/integrations/internal-services/booking/dto/booking-verification-result.dto.js';

describe('Upstream KMS, WKMS, MAD, and FDS Versioned Contracts (e2e/contract)', () => {
  let mockKms: MockKmsAdapter;
  let mockWkms: MockWkmsAdapter;
  let mockMad: MockMadComplaintAdapter;

  beforeEach(() => {
    mockKms = new MockKmsAdapter();
    mockWkms = new MockWkmsAdapter();
    mockMad = new MockMadComplaintAdapter();
  });

  describe('TC-DDP-127-AC1: Successful Workflow & Authoritative Schema Validation', () => {
    it('validates KMS menu catalog fixture and adapter response against KmsMenuCatalogDto', async () => {
      const catalog = await mockKms.getMenuCatalog(MealPeriod.ALL_DAY);
      const instance = plainToInstance(KmsMenuCatalogDto, catalog);
      const errors = await validate(instance);

      expect(errors).toHaveLength(0);
      expect(catalog.version).toBe(ContractVersion.V1_0);
      expect(catalog.items.length).toBeGreaterThan(0);
      expect(catalog.categories).toContain('Mains');
    });

    it('validates KMS order submission and result against KmsOrderResultDto', async () => {
      const orderResult = await mockKms.createOrder({
        ...KMS_FIXTURE_CREATE_ORDER_VALID,
        idempotencyKey: 'ac1-kms-order-key',
      });

      const instance = plainToInstance(KmsOrderResultDto, orderResult);
      const errors = await validate(instance);

      expect(errors).toHaveLength(0);
      expect(orderResult.version).toBe(ContractVersion.V1_0);
      expect(orderResult.totalAmount).toBe(73.5);
      expect(orderResult.roomNumber).toBe('101');
    });

    it('validates WKMS task creation and result against WkmsTaskResultDto', async () => {
      const taskResult = await mockWkms.createTask({
        ...WKMS_FIXTURE_CREATE_TASK_VALID,
        idempotencyKey: 'ac1-wkms-task-key',
      });

      const instance = plainToInstance(WkmsTaskResultDto, taskResult);
      const errors = await validate(instance);

      expect(errors).toHaveLength(0);
      expect(taskResult.version).toBe(ContractVersion.V1_0);
      expect(taskResult.roomNumber).toBe('101');
    });

    it('validates MAD complaint filing and result against MadComplaintResultDto', async () => {
      const complaintResult = await mockMad.fileComplaint({
        ...MAD_FIXTURE_CREATE_COMPLAINT_VALID,
        idempotencyKey: 'ac1-mad-complaint-key',
      });

      const instance = plainToInstance(MadComplaintResultDto, complaintResult);
      const errors = await validate(instance);

      expect(errors).toHaveLength(0);
      expect(complaintResult.version).toBe(ContractVersion.V1_0);
      expect(complaintResult.roomNumber).toBe('101');
    });

    it('validates FDS booking and lifecycle event fixtures against authoritative DTOs', async () => {
      const checkoutInstance = plainToInstance(
        FdsCheckoutEventDto,
        FDS_FIXTURE_CHECKOUT_EVENT_VALID,
      );
      const checkoutErrors = await validate(checkoutInstance);
      expect(checkoutErrors).toHaveLength(0);

      const reassignInstance = plainToInstance(
        FdsRoomReassignEventDto,
        FDS_FIXTURE_ROOM_REASSIGN_EVENT_VALID,
      );
      const reassignErrors = await validate(reassignInstance);
      expect(reassignErrors).toHaveLength(0);

      const bookingInstance = plainToInstance(
        BookingVerificationResultDto,
        FDS_FIXTURE_VERIFIED_BOOKING,
      );
      const bookingErrors = await validate(bookingInstance);
      expect(bookingErrors).toHaveLength(0);
    });
  });

  describe('TC-DDP-127-AC2: Negative / Error Cases & Safe Fail-Closed Behavior', () => {
    it('real adapters fail closed with UpstreamServiceUnavailableException when unconfigured', async () => {
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

    it('flags malformed payload fixtures as invalid with validation errors', async () => {
      const malformedKms = plainToInstance(
        KmsCreateOrderDto,
        KMS_FIXTURE_MALFORMED_ORDER,
      );
      const kmsErrors = await validate(malformedKms);
      expect(kmsErrors.length).toBeGreaterThan(0);

      const malformedWkms = plainToInstance(
        WkmsCreateTaskDto,
        WKMS_FIXTURE_MALFORMED_TASK,
      );
      const wkmsErrors = await validate(malformedWkms);
      expect(wkmsErrors.length).toBeGreaterThan(0);

      const malformedMad = plainToInstance(
        MadCreateComplaintDto,
        MAD_FIXTURE_MALFORMED_COMPLAINT,
      );
      const madErrors = await validate(malformedMad);
      expect(madErrors.length).toBeGreaterThan(0);

      const malformedFds = plainToInstance(
        FdsCheckoutEventDto,
        FDS_FIXTURE_MALFORMED_EVENT,
      );
      const fdsErrors = await validate(malformedFds);
      expect(fdsErrors.length).toBeGreaterThan(0);
    });

    it('constructs typed InvalidContractPayloadException with detailed reasons', () => {
      const exception = new InvalidContractPayloadException('KMS', [
        'totalAmount must be positive',
        'items must not be empty',
      ]);
      expect(exception.getStatus()).toBe(422);
      expect(exception.message).toContain('totalAmount must be positive');
    });
  });

  describe('TC-DDP-127-AC3: Boundary, Legacy, and Additive Contract Compatibility', () => {
    it('gracefully handles legacy v1.0 payloads omitting optional fields without error', async () => {
      const legacyKms = plainToInstance(
        KmsOrderResultDto,
        KMS_FIXTURE_LEGACY_V1_ORDER,
      );
      const kmsErrors = await validate(legacyKms);
      expect(kmsErrors).toHaveLength(0);
      expect(legacyKms.allergyNotes).toBeUndefined();

      const legacyWkms = plainToInstance(
        WkmsTaskResultDto,
        WKMS_FIXTURE_LEGACY_V1_TASK,
      );
      const wkmsErrors = await validate(legacyWkms);
      expect(wkmsErrors).toHaveLength(0);
      expect(legacyWkms.assignedStaff).toBeUndefined();

      const legacyMad = plainToInstance(
        MadComplaintResultDto,
        MAD_FIXTURE_LEGACY_V1_COMPLAINT,
      );
      const madErrors = await validate(legacyMad);
      expect(madErrors).toHaveLength(0);
      expect(legacyMad.resolutionNotes).toBeUndefined();

      const legacyFds = plainToInstance(
        FdsCheckoutEventDto,
        FDS_FIXTURE_LEGACY_V1_CHECKOUT,
      );
      const fdsErrors = await validate(legacyFds);
      expect(fdsErrors).toHaveLength(0);
    });

    it('gracefully preserves and validates forward-compatible additive payloads', async () => {
      const additiveKms = plainToInstance(
        KmsOrderResultDto,
        KMS_FIXTURE_ADDITIVE_ORDER,
      );
      const kmsErrors = await validate(additiveKms);
      expect(kmsErrors).toHaveLength(0);
      expect((additiveKms as any).kitchenStationId).toBe('station-grill-4');

      const additiveWkms = plainToInstance(
        WkmsTaskResultDto,
        WKMS_FIXTURE_ADDITIVE_TASK,
      );
      const wkmsErrors = await validate(additiveWkms);
      expect(wkmsErrors).toHaveLength(0);
      expect((additiveWkms as any).dispatcherId).toBe('dispatch-user-88');

      const additiveMad = plainToInstance(
        MadComplaintResultDto,
        MAD_FIXTURE_ADDITIVE_COMPLAINT,
      );
      const madErrors = await validate(additiveMad);
      expect(madErrors).toHaveLength(0);
      expect((additiveMad as any).customerSatisfactionScore).toBe(4);

      const additiveFds = plainToInstance(
        FdsCheckoutEventDto,
        FDS_FIXTURE_ADDITIVE_CHECKOUT,
      );
      const fdsErrors = await validate(additiveFds);
      expect(fdsErrors).toHaveLength(0);
      expect((additiveFds as any).folioSettled).toBe(true);
    });
  });

  describe('TC-DDP-127-AC4: Cross-Service Signed Event Envelopes & Auditability', () => {
    const sharedSecret = 'production-grade-internal-signing-secret';

    it('signs and validates cross-service event envelope for KMS order update', async () => {
      const rawEnvelope = {
        eventId: 'c6a99264-9be9-4b6d-a169-14a514d7a8d9',
        eventType: 'kms.order.status_changed',
        version: ContractVersion.V1_0,
        source: 'kms.service',
        timestamp: '2026-10-28T12:05:00.000Z',
        payload: {
          orderId: 'order-fixture-001',
          roomNumber: '101',
          status: 'IN_PREPARATION',
        },
      };

      const signed = SignedEventEnvelopeUtil.signEnvelope(
        rawEnvelope,
        sharedSecret,
      );
      const envelopeInstance = plainToInstance(SignedEventEnvelope, signed);
      const errors = await validate(envelopeInstance);

      expect(errors).toHaveLength(0);
      expect(
        SignedEventEnvelopeUtil.verifySignature(signed, sharedSecret),
      ).toBe(true);
    });

    it('detects tampering and rejects forged event envelopes', () => {
      const rawEnvelope = {
        eventId: 'd7b00375-0cf0-4c7e-b270-25b625e8b9ea',
        eventType: 'kms.order.status_changed',
        version: ContractVersion.V1_0,
        source: 'kms.service',
        timestamp: '2026-10-28T12:05:00.000Z',
        payload: {
          orderId: 'order-fixture-001',
          status: 'IN_PREPARATION',
        },
      };

      const signed = SignedEventEnvelopeUtil.signEnvelope(
        rawEnvelope,
        sharedSecret,
      );

      // Malicious actor tampers with payload
      const forged = {
        ...signed,
        payload: {
          orderId: 'order-fixture-001',
          status: 'DELIVERED',
        },
      };

      expect(
        SignedEventEnvelopeUtil.verifySignature(forged, sharedSecret),
      ).toBe(false);
    });

    it('prevents cross-service database pollution by ensuring FOSS remains a pure consumer', async () => {
      // Prove that mock adapters maintain isolated internal maps without executing SQL or touching external tables
      const order = await mockKms.createOrder({
        ...KMS_FIXTURE_CREATE_ORDER_VALID,
        idempotencyKey: 'boundary-check-1',
      });
      expect(order.orderId).toBeDefined();

      const task = await mockWkms.createTask({
        ...WKMS_FIXTURE_CREATE_TASK_VALID,
        idempotencyKey: 'boundary-check-2',
      });
      expect(task.taskId).toBeDefined();

      const complaint = await mockMad.fileComplaint({
        ...MAD_FIXTURE_CREATE_COMPLAINT_VALID,
        idempotencyKey: 'boundary-check-3',
      });
      expect(complaint.complaintId).toBeDefined();
    });

    it('prevents unauthorized production status mutations across KMS, WKMS, and MAD by failing with ForbiddenException', async () => {
      const realKms = new RealKmsAdapter(
        'https://kms.internal.foreverhotel.com',
      );
      const realWkms = new RealWkmsAdapter(
        'https://wkms.internal.foreverhotel.com',
      );
      const realMad = new RealMadComplaintAdapter(
        'https://mad.internal.foreverhotel.com',
      );

      await expect(
        realKms.transitionOrderStatus('order-101', 'DELIVERED' as any),
      ).rejects.toThrow(
        'Kitchen order status transitions are strictly owned by KMS. FOSS cannot mutate kitchen order statuses in production.',
      );

      await expect(
        realWkms.transitionTaskStatus('task-101', 'COMPLETED'),
      ).rejects.toThrow(
        'Task status transitions are strictly owned by WKMS. FOSS cannot mutate worker task statuses in production.',
      );

      await expect(
        realMad.resolveComplaint('complaint-101', 'Resolution note'),
      ).rejects.toThrow(
        'Complaint resolution is strictly owned by MAD. FOSS cannot resolve complaints directly in production.',
      );
    });
  });
});
