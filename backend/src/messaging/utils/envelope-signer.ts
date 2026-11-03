import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignedEventEnvelope } from '../interfaces/messaging.interfaces.js';

/**
 * Builds the canonical message payload string for HMAC-SHA256 signing/verification:
 * `${eventId}:${eventType}:${version}:${source}:${timestamp}:${JSON.stringify(payload)}`
 */
export function buildEnvelopeSigningPayload<T>(
  envelope: Pick<
    SignedEventEnvelope<T>,
    'eventId' | 'eventType' | 'version' | 'source' | 'timestamp' | 'payload'
  >,
): string {
  return `${envelope.eventId}:${envelope.eventType}:${envelope.version}:${envelope.source}:${envelope.timestamp}:${JSON.stringify(envelope.payload)}`;
}

/**
 * Generates an HMAC-SHA256 hexadecimal signature for an event envelope.
 */
export function signEnvelope<T>(
  envelope: Pick<
    SignedEventEnvelope<T>,
    'eventId' | 'eventType' | 'version' | 'source' | 'timestamp' | 'payload'
  >,
  secretKey: string,
): string {
  const payloadStr = buildEnvelopeSigningPayload(envelope);
  return createHmac('sha256', secretKey).update(payloadStr).digest('hex');
}

/**
 * Verifies the HMAC-SHA256 signature of an incoming event envelope using timingSafeEqual.
 */
export function verifyEnvelopeSignature<T>(
  envelope: SignedEventEnvelope<T>,
  secretKey: string,
): boolean {
  if (!envelope.signature || !secretKey) {
    return false;
  }
  try {
    const expectedSig = signEnvelope(envelope, secretKey);
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    const actualBuf = Buffer.from(envelope.signature, 'utf8');

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}
