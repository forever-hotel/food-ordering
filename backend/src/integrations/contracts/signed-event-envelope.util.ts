import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignedEventEnvelope } from './signed-event-envelope.dto.js';

export class SignedEventEnvelopeUtil {
  public static computeSignature<T>(
    envelope: Omit<SignedEventEnvelope<T>, 'signature'>,
    secret: string,
  ): string {
    const serializedPayload =
      typeof envelope.payload === 'string'
        ? envelope.payload
        : JSON.stringify(envelope.payload);

    const message = `${envelope.eventId}:${envelope.eventType}:${envelope.version}:${envelope.source}:${envelope.timestamp}:${serializedPayload}`;
    return createHmac('sha256', secret).update(message).digest('hex');
  }

  public static signEnvelope<T>(
    envelope: Omit<SignedEventEnvelope<T>, 'signature'>,
    secret: string,
  ): SignedEventEnvelope<T> {
    const signature = this.computeSignature(envelope, secret);
    return {
      ...envelope,
      signature,
    };
  }

  public static verifySignature<T>(
    envelope: SignedEventEnvelope<T>,
    secret: string,
  ): boolean {
    if (!envelope || !envelope.signature || !secret) {
      return false;
    }

    try {
      const expectedSignature = this.computeSignature(envelope, secret);
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const actualBuffer = Buffer.from(envelope.signature, 'hex');

      if (expectedBuffer.length !== actualBuffer.length) {
        return false;
      }

      return timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      return false;
    }
  }
}
