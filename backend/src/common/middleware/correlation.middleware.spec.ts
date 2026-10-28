import { jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { correlationMiddleware } from './correlation.middleware.js';

describe('correlationMiddleware', () => {
  let mockRequest: Partial<Request & { correlationId?: string }>;
  let mockResponse: {
    setHeader: jest.MockedFunction<(name: string, value: string) => any>;
  };
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      setHeader: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  it('generates a new UUID correlationId when none is provided in headers', () => {
    correlationMiddleware(
      mockRequest as Request & { correlationId?: string },
      mockResponse as unknown as Response,
      nextFunction,
    );

    expect(mockRequest.correlationId).toBeDefined();
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-Correlation-ID',
      mockRequest.correlationId,
    );
    expect(nextFunction).toHaveBeenCalled();
  });

  it('preserves existing X-Correlation-ID from request header', () => {
    mockRequest.headers = {
      'x-correlation-id': 'client-provided-corr-id',
    };

    correlationMiddleware(
      mockRequest as Request & { correlationId?: string },
      mockResponse as unknown as Response,
      nextFunction,
    );

    expect(mockRequest.correlationId).toBe('client-provided-corr-id');
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-Correlation-ID',
      'client-provided-corr-id',
    );
    expect(nextFunction).toHaveBeenCalled();
  });
});
