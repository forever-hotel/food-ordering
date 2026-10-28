import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ContractVersion } from './contract-version.enum.js';
import {
  InvalidContractPayloadException,
  ContractVersionMismatchException,
  UpstreamServiceUnavailableException,
} from './upstream-integration.exception.js';
import {
  KmsCreateOrderDto,
  KmsOrderItemDto,
} from '../internal-services/kms/dto/kms-order.dto.js';
import { KmsOrderResultDto } from '../internal-services/kms/dto/kms-order-result.dto.js';
import {
  KmsMenuCatalogDto,
  KmsMenuItemDto,
  MealPeriod,
} from '../internal-services/kms/dto/kms-menu.dto.js';
import {
  WkmsCreateTaskDto,
  TaskPriority,
  TaskType,
} from '../internal-services/wkms/dto/wkms-task.dto.js';
import { WkmsTaskResultDto } from '../internal-services/wkms/dto/wkms-task-result.dto.js';
import {
  MadCreateComplaintDto,
  ComplaintCategory,
  ComplaintSeverity,
} from '../internal-services/mad/dto/mad-complaint.dto.js';
import { MadComplaintResultDto } from '../internal-services/mad/dto/mad-complaint-result.dto.js';
import { BookingVerificationResultDto } from '../internal-services/booking/dto/booking-verification-result.dto.js';
import { BookingStatus } from '../internal-services/booking/enums/booking-status.enum.js';

describe('Upstream Contracts DTO and Exception Specifications', () => {
  it('instantiates and validates KmsOrderResultDto and KmsCreateOrderDto', async () => {
    const item = plainToInstance(KmsOrderItemDto, {
      itemId: 'item-1',
      name: 'Burger',
      unitPrice: 15.0,
      quantity: 1,
      specialNotes: 'Extra cheese',
    });
    expect(await validate(item)).toHaveLength(0);

    const createDto = plainToInstance(KmsCreateOrderDto, {
      roomNumber: '101',
      bookingId: 'booking-101',
      items: [item],
      totalAmount: 15.0,
      idempotencyKey: 'key-123',
    });
    expect(await validate(createDto)).toHaveLength(0);

    const resultDto = plainToInstance(KmsOrderResultDto, {
      orderId: 'order-101',
      roomNumber: '101',
      bookingId: 'booking-101',
      status: 'PLACED',
      totalAmount: 15.0,
      items: [item],
      createdAt: '2026-10-28T12:00:00.000Z',
      updatedAt: '2026-10-28T12:00:00.000Z',
      version: ContractVersion.V1_0,
    });
    expect(await validate(resultDto)).toHaveLength(0);

    const menuItem = plainToInstance(KmsMenuItemDto, {
      id: 'item-1',
      name: 'Burger',
      description: 'Tasty',
      price: 15.0,
      category: 'Mains',
      mealPeriods: [MealPeriod.ALL_DAY],
      available: true,
      estimatedPrepMinutes: 15,
      imageUrl: null,
      dietaryFlags: [],
      allergens: [],
    });
    expect(await validate(menuItem)).toHaveLength(0);

    const catalog = plainToInstance(KmsMenuCatalogDto, {
      version: ContractVersion.V1_0,
      generatedAt: '2026-10-28T12:00:00.000Z',
      categories: ['Mains'],
      items: [menuItem],
    });
    expect(await validate(catalog)).toHaveLength(0);
  });

  it('instantiates and validates WkmsTaskResultDto and WkmsCreateTaskDto', async () => {
    const createDto = plainToInstance(WkmsCreateTaskDto, {
      roomNumber: '101',
      bookingId: 'booking-101',
      taskType: TaskType.EXTRA_TOWELS,
      priority: TaskPriority.NORMAL,
      idempotencyKey: 'wkms-key-1',
    });
    expect(await validate(createDto)).toHaveLength(0);

    const resultDto = plainToInstance(WkmsTaskResultDto, {
      taskId: 'task-101',
      roomNumber: '101',
      bookingId: 'booking-101',
      taskType: 'EXTRA_TOWELS',
      status: 'SUBMITTED',
      priority: TaskPriority.NORMAL,
      createdAt: '2026-10-28T12:00:00.000Z',
      updatedAt: '2026-10-28T12:00:00.000Z',
      version: ContractVersion.V1_0,
    });
    expect(await validate(resultDto)).toHaveLength(0);
  });

  it('instantiates and validates MadComplaintResultDto and MadCreateComplaintDto', async () => {
    const createDto = plainToInstance(MadCreateComplaintDto, {
      roomNumber: '101',
      bookingId: 'booking-101',
      category: ComplaintCategory.FOOD,
      severity: ComplaintSeverity.MEDIUM,
      subject: 'Food Cold',
      description: 'Arrived cold',
      idempotencyKey: 'mad-key-1',
    });
    expect(await validate(createDto)).toHaveLength(0);

    const resultDto = plainToInstance(MadComplaintResultDto, {
      complaintId: 'complaint-101',
      roomNumber: '101',
      bookingId: 'booking-101',
      category: ComplaintCategory.FOOD,
      severity: ComplaintSeverity.MEDIUM,
      subject: 'Food Cold',
      description: 'Arrived cold',
      status: 'SUBMITTED',
      createdAt: '2026-10-28T12:00:00.000Z',
      updatedAt: '2026-10-28T12:00:00.000Z',
      version: ContractVersion.V1_0,
    });
    expect(await validate(resultDto)).toHaveLength(0);
  });

  it('instantiates and validates BookingVerificationResultDto', async () => {
    const booking = plainToInstance(BookingVerificationResultDto, {
      valid: true,
      bookingId: 'booking-101',
      roomNumber: '101',
      status: BookingStatus.CHECKED_IN,
      stayStart: '2026-10-27T14:00:00.000Z',
      stayEnd: '2026-10-29T11:00:00.000Z',
      verifiedAt: '2026-10-28T12:00:00.000Z',
    });
    expect(await validate(booking)).toHaveLength(0);
  });

  it('constructs typed exceptions with appropriate HTTP statuses', () => {
    const unavail = new UpstreamServiceUnavailableException('KMS', 'down');
    expect(unavail.getStatus()).toBe(503);
    expect(unavail.message).toContain('KMS');

    const invalid = new InvalidContractPayloadException('WKMS', [
      'missing field',
    ]);
    expect(invalid.getStatus()).toBe(422);

    const mismatch = new ContractVersionMismatchException('1.0', '2.0');
    expect(mismatch.getStatus()).toBe(400);
    expect(mismatch.message).toContain('1.0');
  });
});
