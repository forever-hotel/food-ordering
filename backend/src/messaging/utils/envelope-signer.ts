import { SignedEventEnvelope } from '../../integrations/contracts/signed-event-envelope.dto.js';
import { SignedEventEnvelopeUtil } from '../../integrations/contracts/signed-event-envelope.util.js';

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
  const serialized =
    typeof envelope.payload === 'string'
      ? envelope.payload
      : JSON.stringify(envelope.payload);
  return `${envelope.eventId}:${envelope.eventType}:${envelope.version}:${envelope.source}:${envelope.timestamp}:${serialized}`;
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
  return SignedEventEnvelopeUtil.computeSignature(envelope as any, secretKey);
}

/**
 * Verifies the HMAC-SHA256 signature of an incoming event envelope using timingSafeEqual.
 */
export function verifyEnvelopeSignature<T>(
  envelope: SignedEventEnvelope<T>,
  secretKey: string,
): boolean {
  return SignedEventEnvelopeUtil.verifySignature(envelope, secretKey);
}
