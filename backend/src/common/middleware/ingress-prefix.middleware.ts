import type { NextFunction, Request, Response } from 'express';

/**
 * Validates and sanitizes the configured API prefix.
 * Defaults to 'foss' if unset, empty, or containing invalid characters.
 */
export function getValidatedApiPrefix(envPrefix?: string): string {
  const raw = envPrefix ?? process.env.API_PREFIX ?? 'foss';
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return 'foss';
  }
  return trimmed;
}

/**
 * Express middleware for FOSS ingress path normalization.
 *
 * Background:
 * The unmodified Forever Hotel API Gateway forwards requests matching `/foss/*`
 * with `rewritePrefix: "/foss"`. Consequently, incoming upstream requests arrive at
 * FOSS with the `/foss` path segment intact (e.g. `GET /foss/menu`).
 *
 * This middleware strips the leading `/${prefix}` segment when matched as a complete
 * path segment, routing it transparently to existing unprefixed NestJS controllers:
 * - `/foss/menu?category=Mains` -> `/menu?category=Mains`
 * - `/foss/guest-sessions/qr`    -> `/guest-sessions/qr`
 * - `/foss/health/ready`         -> `/health/ready`
 * - `/foss`                      -> `/`
 * - `/foss/`                     -> `/`
 *
 * Non-prefixed paths (direct container health checks `GET /health/ready`, direct
 * backend-to-backend internal webhooks, or direct local tests) pass through unchanged.
 *
 * Paths with similar names (e.g. `/fossils`) are NOT modified.
 */
export function createIngressPrefixMiddleware(customPrefix?: string) {
  const prefix = getValidatedApiPrefix(customPrefix);
  const prefixPattern = new RegExp(`^/${prefix}(?:/(.*)|(\\?.*)|$)`);

  return function ingressPrefixMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    const originalUrl = req.url;

    if (prefixPattern.test(originalUrl)) {
      const remainder = originalUrl.replace(new RegExp(`^/${prefix}`), '');
      req.url = remainder.startsWith('/')
        ? remainder
        : remainder.startsWith('?')
          ? `/${remainder}`
          : remainder === ''
            ? '/'
            : `/${remainder}`;
    }

    next();
  };
}
