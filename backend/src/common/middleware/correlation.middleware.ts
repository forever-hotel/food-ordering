import * as crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface CorrelatedRequest extends Request {
  correlationId: string;
}

export function correlationMiddleware(
  req: Request & { correlationId?: string },
  res: Response,
  next: NextFunction,
): void {
  const existingCorrelationId =
    req.headers?.['x-correlation-id'] || req.headers?.['x-request-id'];

  const correlationId =
    typeof existingCorrelationId === 'string' &&
    existingCorrelationId.trim().length > 0
      ? existingCorrelationId.trim()
      : crypto.randomUUID();

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}
