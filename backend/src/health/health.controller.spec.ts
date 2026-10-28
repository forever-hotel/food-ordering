import { jest } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

import {
  LivenessResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  let mockHealthService: {
    getLiveness: jest.MockedFunction<() => LivenessResponseDto>;
    checkReadiness: jest.MockedFunction<() => Promise<ReadinessResponseDto>>;
  };

  beforeEach(() => {
    mockHealthService = {
      getLiveness: jest.fn<() => LivenessResponseDto>().mockReturnValue({
        status: 'ok',
        uptime: 10.5,
        timestamp: '2026-10-28T15:00:00.000Z',
      }),
      checkReadiness: jest
        .fn<() => Promise<ReadinessResponseDto>>()
        .mockResolvedValue({
          status: 'ok',
          uptime: 10.5,
          timestamp: '2026-10-28T15:00:00.000Z',
          database: {
            status: 'up',
            type: 'postgres',
          },
        }),
    };

    controller = new HealthController(
      mockHealthService as unknown as HealthService,
    );
  });

  describe('getLiveness', () => {
    it('returns liveness result for /health', () => {
      const result = controller.getLiveness();
      expect(result.status).toBe('ok');
      expect(mockHealthService.getLiveness).toHaveBeenCalled();
    });

    it('returns liveness result for /health/live', () => {
      const result = controller.getLive();
      expect(result.status).toBe('ok');
      expect(mockHealthService.getLiveness).toHaveBeenCalled();
    });
  });

  describe('getReadiness', () => {
    it('returns 200 OK readiness status when database is ready', async () => {
      const mockResponse = {
        status: jest.fn(),
      } as unknown as Response;

      const result = await controller.getReadiness(mockResponse);

      expect(result.status).toBe('ok');
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('sets HTTP 503 Service Unavailable when readiness probe fails', async () => {
      mockHealthService.checkReadiness.mockResolvedValue({
        status: 'error',
        uptime: 10.5,
        timestamp: '2026-10-28T15:00:00.000Z',
        database: {
          status: 'down',
          type: 'postgres',
          error: 'Connection timeout',
        },
      });

      const mockResponse = {
        status: jest.fn(),
      } as unknown as Response;

      const result = await controller.getReadiness(mockResponse);

      expect(result.status).toBe('error');
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    });
  });
});
