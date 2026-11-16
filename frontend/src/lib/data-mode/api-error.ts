export class ApiError extends Error {
  readonly statusCode: number;
  readonly data?: unknown;

  constructor(message: string, statusCode: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.data = data;
  }

  get status(): number {
    return this.statusCode;
  }
}
