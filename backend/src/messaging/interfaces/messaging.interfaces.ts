/**
 * Typing definitions for RabbitMQ messaging and cross-subsystem event envelopes.
 * Conforms to SDS §5 and upstream service contracts.
 */

import { SignedEventEnvelope } from '../../integrations/contracts/signed-event-envelope.dto.js';

export { SignedEventEnvelope };

export interface RabbitMQConfig {
  enabled: boolean;
  url: string;
  exchange: string;
  dlxExchange: string;
  incomingQueue: string;
  dlq: string;
  internalServiceKey: string;
}

export interface PublishOptions {
  correlationId?: string;
  headers?: Record<string, unknown>;
}

export type ConsumerHandler<T = Record<string, unknown>> = (
  envelope: SignedEventEnvelope<T>,
  routingKey: string,
) => Promise<void>;

/**
 * Payload schemas for FOSS-originated domain events.
 */
export interface FossOrderCreatedPayload {
  orderId: string;
  bookingId: string;
  roomNumber: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
}

export interface FossServiceRequestCreatedPayload {
  requestId: string;
  bookingId: string;
  roomNumber: string;
  category: string;
  priority: string;
  createdAt: string;
}

export interface FossComplaintSubmittedPayload {
  complaintId: string;
  bookingId: string;
  roomNumber: string;
  category: string;
  severity: string;
  subject: string;
  createdAt: string;
}

export interface FossSessionRevokedPayload {
  bookingId: string;
  roomNumber: string;
  reason: string;
  revokedAt: string;
}
