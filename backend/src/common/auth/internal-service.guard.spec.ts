import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { InternalServiceGuard } from './internal-service.guard.js';

describe('InternalServiceGuard', () => {
  let guard: InternalServiceGuard;
  let configService: ConfigService;

  const mockConfig: Record<string, string | undefined> = {
    INTERNAL_SERVICE_KEY: 'test-internal-secret-12345',
    DEMO_MODE: 'false',
    MOCK_EXTERNAL_SERVICES: 'false',
    NODE_ENV: 'test',
  };

  const createMockContext = (
    headers: Record<string, string | undefined>,
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    configService = {
      get: (key: string) => mockConfig[key],
    } as unknown as ConfigService;
    guard = new InternalServiceGuard(configService);
  });

  it('allows access when valid X-Internal-Service-Key is provided', () => {
    const context = createMockContext({
      'x-internal-service-key': 'test-internal-secret-12345',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when valid X-FDS-Signature is provided', () => {
    const context = createMockContext({
      'x-fds-signature': 'test-internal-secret-12345',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws UnauthorizedException when no credential header is provided', () => {
    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException when credential does not match', () => {
    const context = createMockContext({
      'x-internal-service-key': 'wrong-secret',
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('falls back to default demo secret when DEMO_MODE=true and secret is unconfigured', () => {
    const demoConfigService = {
      get: (key: string) => (key === 'DEMO_MODE' ? 'true' : undefined),
    } as unknown as ConfigService;
    const demoGuard = new InternalServiceGuard(demoConfigService);

    const validContext = createMockContext({
      'x-internal-service-key': 'fds-internal-secret-demo',
    });
    expect(demoGuard.canActivate(validContext)).toBe(true);
  });

  it('throws ForbiddenException when no secret is configured in production and demo fallback is blocked', () => {
    const prodConfigService = {
      get: (key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'DEMO_MODE') return 'false';
        return undefined;
      },
    } as unknown as ConfigService;
    const prodGuard = new InternalServiceGuard(prodConfigService);

    const context = createMockContext({
      'x-internal-service-key': 'some-secret',
    });
    expect(() => prodGuard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException in production if default demo secret is inadvertently configured', () => {
    const prodConfigService = {
      get: (key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'DEMO_MODE') return 'true';
        return undefined;
      },
    } as unknown as ConfigService;
    const prodGuard = new InternalServiceGuard(prodConfigService);

    const context = createMockContext({
      'x-internal-service-key': 'fds-internal-secret-demo',
    });
    expect(() => prodGuard.canActivate(context)).toThrow(ForbiddenException);
  });
});
