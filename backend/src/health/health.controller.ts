import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import {
  LivenessResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Returns process uptime and basic application health.',
  })
  @ApiResponse({
    status: 200,
    description: 'Application is running',
    type: LivenessResponseDto,
  })
  getLiveness(): LivenessResponseDto {
    return this.healthService.getLiveness();
  }

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Container liveness probe',
    description: 'Endpoint for container orchestrator liveness checks.',
  })
  @ApiResponse({
    status: 200,
    description: 'Container is live',
    type: LivenessResponseDto,
  })
  getLive(): LivenessResponseDto {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe with database connectivity',
    description:
      'Pings PostgreSQL database with SELECT 1. Returns 200 if healthy, or 503 if database is unreachable.',
  })
  @ApiResponse({
    status: 200,
    description: 'Application and database are ready to accept traffic',
    type: ReadinessResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'Application dependency (database) is not ready',
    type: ReadinessResponseDto,
  })
  async getReadiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessResponseDto> {
    const result = await this.healthService.checkReadiness();
    if (result.status === 'error') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
