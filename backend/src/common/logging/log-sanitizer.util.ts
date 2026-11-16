/**
 * Sanitizes log records by redacting sensitive secrets, tokens, credentials, and guest PII.
 * Enforces DDP-126 non-negotiable verification check: no raw secrets or tokens appear in logs.
 */
export class LogSanitizer {
  private static readonly SENSITIVE_KEYS = new Set([
    'password',
    'pass',
    'secret',
    'token',
    'sessiontoken',
    'qrtoken',
    'authorization',
    'bearer',
    'database_url',
    'databaseurl',
    'key',
    'apikey',
    'creditcard',
    'cardnumber',
  ]);

  /**
   * Redacts sensitive fields in an object or primitive value.
   */
  static sanitize<T>(data: T): T {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return LogSanitizer.sanitizeString(data) as unknown as T;
    }

    if (Array.isArray(data)) {
      return data.map((item) => LogSanitizer.sanitize(item)) as unknown as T;
    }

    if (typeof data === 'object') {
      const sanitizedObj: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
        if (LogSanitizer.SENSITIVE_KEYS.has(lowerKey)) {
          sanitizedObj[key] = '[REDACTED]';
        } else {
          sanitizedObj[key] = LogSanitizer.sanitize(value);
        }
      }
      return sanitizedObj as T;
    }

    return data;
  }

  /**
   * Masks sensitive patterns inside string logs (e.g. Bearer tokens, URLs with passwords).
   */
  private static sanitizeString(str: string): string {
    return str
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, '$1[REDACTED]$2')
      .replace(/(secret|token|password)=[^&\s]+/gi, '$1=[REDACTED]');
  }
}
