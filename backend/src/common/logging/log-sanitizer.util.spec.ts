import { LogSanitizer } from './log-sanitizer.util.js';

describe('LogSanitizer', () => {
  it('redacts sensitive fields in nested objects', () => {
    const input = {
      username: 'guest101',
      sessionToken: 'secret-raw-token-12345',
      qrToken: 'header.payload.signature',
      password: 'super-secret-password',
      nested: {
        apiKey: 'api-key-999',
        safeProperty: 'hello world',
      },
    };

    const output = LogSanitizer.sanitize(input);

    expect(output.username).toBe('guest101');
    expect(output.sessionToken).toBe('[REDACTED]');
    expect(output.qrToken).toBe('[REDACTED]');
    expect(output.password).toBe('[REDACTED]');
    expect(output.nested.apiKey).toBe('[REDACTED]');
    expect(output.nested.safeProperty).toBe('hello world');
  });

  it('redacts password in postgres database URL string', () => {
    const url =
      'postgresql://postgres:myPassword123!@localhost:5432/food_ordering';
    const sanitized = LogSanitizer.sanitize(url);

    expect(sanitized).toBe(
      'postgresql://postgres:[REDACTED]@localhost:5432/food_ordering',
    );
    expect(sanitized).not.toContain('myPassword123!');
  });

  it('redacts Bearer tokens in log strings', () => {
    const logLine =
      'Incoming request with Authorization: Bearer abcdef1234567890';
    const sanitized = LogSanitizer.sanitize(logLine);

    expect(sanitized).toBe(
      'Incoming request with Authorization: Bearer [REDACTED]',
    );
    expect(sanitized).not.toContain('abcdef1234567890');
  });

  it('handles null, undefined, and primitive types without error', () => {
    expect(LogSanitizer.sanitize(null)).toBeNull();
    expect(LogSanitizer.sanitize(undefined)).toBeUndefined();
    expect(LogSanitizer.sanitize(12345)).toBe(12345);
    expect(LogSanitizer.sanitize(true)).toBe(true);
  });
});
