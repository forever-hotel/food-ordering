import { jest } from '@jest/globals';
import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: {
    status: jest.MockedFunction<(status: number) => any>;
    json: jest.MockedFunction<(body: any) => any>;
  };
  let mockRequest: {
    url: string;
    method: string;
    headers: Record<string, string>;
    correlationId?: string;
  };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      url: '/test/endpoint?query=123',
      method: 'POST',
      headers: { 'x-correlation-id': 'test-corr-id' },
      correlationId: 'test-corr-id',
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('formats HttpException with standard envelope and correlation ID', () => {
    const exception = new BadRequestException('Validation failed');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        correlationId: 'test-corr-id',
        path: '/test/endpoint',
        error: 'Bad Request',
        message: 'Validation failed',
      }),
    );
  });

  it('formats custom HttpException with object message and error', () => {
    const exception = new HttpException(
      { message: ['field is required'], error: 'Unprocessable Entity' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        message: ['field is required'],
      }),
    );
  });

  it('formats unhandled Error as safe 500 without leaking stack trace or internal message', () => {
    const internalError = new Error(
      'database connection password=secret timeout',
    );

    filter.catch(internalError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'An unexpected server error occurred.',
        correlationId: 'test-corr-id',
      }),
    );
  });

  it('generates fallback correlation ID when none is provided in request', () => {
    mockRequest.headers = {};
    delete mockRequest.correlationId;

    const exception = new BadRequestException('Bad request');
    filter.catch(exception, mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'unknown-correlation-id',
      }),
    );
  });
});
