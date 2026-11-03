import {
  buildEnvelopeSigningPayload,
  signEnvelope,
  verifyEnvelopeSignature,
} from './envelope-signer.js';

describe('EnvelopeSigner', () => {
  const secretKey = 'test-secret-key-32-characters-minimum-for-testing';

  const sampleEnvelope = {
    eventId: 'evt-12345',
    eventType: 'foss.order.created',
    version: '1.0',
    source: 'foss.service',
    timestamp: '2026-11-03T12:00:00.000Z',
    payload: {
      orderId: 'ord-001',
      roomNumber: '101',
      bookingId: 'book-101',
      totalAmount: 45.5,
    },
  };

  it('builds canonical message signing payload with deterministic JSON formatting', () => {
    const payloadStr = buildEnvelopeSigningPayload(sampleEnvelope);
    expect(payloadStr).toBe(
      `evt-12345:foss.order.created:1.0:foss.service:2026-11-03T12:00:00.000Z:${JSON.stringify(sampleEnvelope.payload)}`,
    );
  });

  it('generates a valid hexadecimal signature and verifies successfully', () => {
    const signature = signEnvelope(sampleEnvelope, secretKey);
    expect(signature).toHaveLength(64); // sha256 hex is 64 characters

    const verified = verifyEnvelopeSignature(
      { ...sampleEnvelope, signature },
      secretKey,
    );
    expect(verified).toBe(true);
  });

  it('rejects tampered payload content', () => {
    const signature = signEnvelope(sampleEnvelope, secretKey);
    const tampered = {
      ...sampleEnvelope,
      signature,
      payload: { ...sampleEnvelope.payload, totalAmount: 999.0 },
    };

    const verified = verifyEnvelopeSignature(tampered, secretKey);
    expect(verified).toBe(false);
  });

  it('rejects tampered signature', () => {
    const signature = signEnvelope(sampleEnvelope, secretKey);
    const corruptedSig =
      signature.substring(0, 63) + (signature.endsWith('a') ? 'b' : 'a');

    const verified = verifyEnvelopeSignature(
      { ...sampleEnvelope, signature: corruptedSig },
      secretKey,
    );
    expect(verified).toBe(false);
  });

  it('rejects mismatched secret key', () => {
    const signature = signEnvelope(sampleEnvelope, secretKey);
    const wrongKey = 'different-secret-key-32-chars-long';

    const verified = verifyEnvelopeSignature(
      { ...sampleEnvelope, signature },
      wrongKey,
    );
    expect(verified).toBe(false);
  });

  it('returns false when signature or secret key is empty', () => {
    expect(
      verifyEnvelopeSignature({ ...sampleEnvelope, signature: '' }, secretKey),
    ).toBe(false);
    expect(
      verifyEnvelopeSignature({ ...sampleEnvelope, signature: 'some-sig' }, ''),
    ).toBe(false);
  });
});
