/**
 * RabbitMQ Messaging Constants and Routing Key definitions for FOSS (Food Ordering Subsystem).
 * Adheres to SDS §1.4, §5, and DDP-160 event specifications.
 */

export const RABBITMQ_EXCHANGE_NAME = 'forever.events';
export const RABBITMQ_EXCHANGE_TYPE = 'topic';

export const RABBITMQ_DLX_EXCHANGE_NAME = 'forever.events.dlx';
export const RABBITMQ_DLX_EXCHANGE_TYPE = 'direct';

export const RABBITMQ_INCOMING_QUEUE = 'foss.incoming.events';
export const RABBITMQ_DLQ_NAME = 'foss.events.dlq';

/**
 * Subscribed routing key patterns consumed by FOSS.
 */
export const RABBITMQ_CONSUMER_BINDINGS = [
  'kms.order.*', // Kitchen state updates (e.g. kms.order.status_changed, kms.order.ready)
  'wkms.task.*', // Worker task updates (e.g. wkms.task.status_changed)
  'mad.complaint.*', // Manager complaint triage updates (e.g. mad.complaint.status_changed)
  'fds.guest.*', // Front desk lifecycle events (e.g. fds.guest.checkout, fds.guest.room_reassigned)
] as const;

/**
 * FOSS-owned publisher routing keys.
 * FOSS publishes events strictly for resources it authoritatively originates.
 */
export const FOSS_ROUTING_KEYS = {
  ORDER_CREATED: 'foss.order.created',
  SERVICE_REQUEST_CREATED: 'foss.service_request.created',
  COMPLAINT_SUBMITTED: 'foss.complaint.submitted',
  SESSION_REVOKED: 'foss.session.revoked',
} as const;

/**
 * Maximum retry attempts before routing a failed poison message to DLQ.
 */
export const RABBITMQ_MAX_RETRIES = 3;

/**
 * Default reconnect backoff delays in milliseconds.
 */
export const RABBITMQ_INITIAL_RECONNECT_DELAY_MS = 1000;
export const RABBITMQ_MAX_RECONNECT_DELAY_MS = 30000;
