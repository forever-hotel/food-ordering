import { describe, expect, it } from '@jest/globals';
import { ContractVersion } from './contract-version.enum.js';
import { SignedEventEnvelopeUtil } from './signed-event-envelope.util.js';

describe('SignedEventEnvelopeUtil', () => {
  const secret = 'shared-internal-secret-2026';

  const unsignedEnvelope = {
    eventId: 'evt-1111-2222-3333',
    eventType: 'kms.order.status_changed',
    version: ContractVersion.V1_0,
    source: 'kms.service',
    timestamp: '2026-10-28T12:00:00.000Z',
    payload: {
      orderId: 'order-101',
      status: 'IN_PREPARATION',
    },
  };

  it('computes and signs an envelope with a valid HMAC-SHA256 signature', () => {
    const signed = SignedEventEnvelopeUtil.signEnvelope(
      unsignedEnvelope,
      secret,
    );

    expect(signed.signature).toBeDefined();
    expect(signed.signature.length).toBe(64); // 256 bits = 64 hex characters
    expect(SignedEventEnvelopeUtil.verifySignature(signed, secret)).toBe(true);
  });

  it('rejects an envelope if the signature is invalid or computed with another secret', () => {
    const signed = SignedEventEnvelopeUtil.signEnvelope(
      unsignedEnvelope,
      secret,
    );
    const wrongSecret = 'different-unauthorized-secret';

    expect(SignedEventEnvelopeUtil.verifySignature(signed, wrongSecret)).toBe(
      false,
    );
  });

  it('rejects an envelope if payload data has been tampered with', () => {
    const signed = SignedEventEnvelopeUtil.signEnvelope(
      unsignedEnvelope,
      secret,
    );

    // Tamper with payload
    const tampered = {
      ...signed,
      payload: {
        orderId: 'order-101',
        status: 'DELIVERED', // altered status
      },
    };

    expect(SignedEventEnvelopeUtil.verifySignature(tampered, secret)).toBe(
      false,
    );
  });

  it('rejects an envelope if timestamp or eventId has been modified', () => {
    const signed = SignedEventEnvelopeUtil.signEnvelope(
      unsignedEnvelope,
      secret,
    );

    const tampered = {
      ...signed,
      eventId: 'different-event-id',
    };

    expect(SignedEventEnvelopeUtil.verifySignature(tampered, secret)).toBe(
      false,
    );
  });

  it('returns false safely when signature or secret is empty or malformed', () => {
    expect(SignedEventEnvelopeUtil.verifySignature(null as any, secret)).toBe(
      false,
    );
    expect(SignedEventEnvelopeUtil.verifySignature({} as any, secret)).toBe(
      false,
    );
    expect(
      SignedEventEnvelopeUtil.verifySignature(
        { ...unsignedEnvelope, signature: 'not-a-valid-hex' },
        secret,
      ),
    ).toBe(false);
  });
});
