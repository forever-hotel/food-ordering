import * as crypto from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  private readonly logger = new Logger(InternalServiceGuard.name);
  private readonly defaultDemoSecret = 'fds-internal-secret-demo';

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const serviceKeyHeader =
      request.headers?.['x-internal-service-key'] ||
      request.headers?.['x-fds-signature'];

    if (!serviceKeyHeader || typeof serviceKeyHeader !== 'string') {
      this.logger.warn(
        'Internal service request rejected: Missing X-Internal-Service-Key or X-FDS-Signature header.',
      );
      throw new UnauthorizedException(
        'Internal service authentication credential is required.',
      );
    }

    const configuredSecret =
      this.configService.get<string>('INTERNAL_SERVICE_KEY') ||
      this.configService.get<string>('INTERNAL_SERVICE_SECRET') ||
      this.configService.get<string>('FDS_WEBHOOK_SECRET');

    const demoMode =
      this.configService.get<string>('DEMO_MODE') === 'true' ||
      this.configService.get<string>('MOCK_EXTERNAL_SERVICES') === 'true';

    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    const expectedSecret =
      configuredSecret || (demoMode ? this.defaultDemoSecret : null);

    if (!expectedSecret) {
      this.logger.error(
        'Internal service secret is not configured in environment. Failing closed.',
      );
      throw new ForbiddenException(
        'Internal service authentication is unconfigured.',
      );
    }

    if (isProduction && expectedSecret === this.defaultDemoSecret) {
      this.logger.error(
        'Security violation: Default demo service secret used in production environment.',
      );
      throw new ForbiddenException(
        'Default demo secret forbidden in production.',
      );
    }

    const providedKey = serviceKeyHeader.trim();
    const isMatch =
      this.timingSafeCompare(providedKey, expectedSecret) ||
      (demoMode &&
        !isProduction &&
        this.timingSafeCompare(providedKey, this.defaultDemoSecret));

    if (!isMatch) {
      this.logger.warn(
        'Internal service request rejected: Invalid service credential provided.',
      );
      throw new ForbiddenException('Invalid internal service credential.');
    }

    return true;
  }

  /**
   * Constant-time comparison using SHA-256 digests to eliminate side-channel timing attacks.
   */
  private timingSafeCompare(provided: string, expected: string): boolean {
    const hashProvided = crypto.createHash('sha256').update(provided).digest();
    const hashExpected = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(hashProvided, hashExpected);
  }
}
