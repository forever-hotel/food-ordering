// Explicit disposable-stack acceptance check. Never point this at Neon or a real booking.
import assert from 'node:assert/strict';
import { Client } from 'pg';
const url = new URL(process.env.FOSS_TEST_DATABASE_URL || '');
assert.ok(
  ['localhost', '127.0.0.1'].includes(url.hostname) &&
    url.pathname === '/foss_test',
  'Disposable loopback foss_test database required',
);
const base = process.env.FOSS_TEST_API_URL || 'http://127.0.0.1:14004';
assert.equal(new URL(base).origin, 'http://127.0.0.1:14004');
const key = 'local-foss-integration-service-key-at-least-32';
const booking = 'c1111111-1111-4111-8111-111111111111';
const second = 'c2222222-2222-4222-8222-222222222222';
const db = new Client({ connectionString: url.toString() });
await db.connect();
async function api(
  path,
  { body, token, internal = false, status = 200, headers = {} } = {},
) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(internal ? { 'x-internal-service-key': key } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(
    response.status,
    status,
    `${path}: ${response.status === status ? 'ok' : JSON.stringify(result)}`,
  );
  return result;
}
try {
  await api('/health/ready');
  const slip = await api('/guest-sessions/internal/qr/issue', {
    internal: true,
    body: { bookingId: booking, roomNumber: 'TEST-101' },
  });
  const session = await api('/guest-sessions/qr', {
    body: { qrToken: slip.qrToken },
  });
  assert.ok(session.sessionToken);
  await api('/guest-sessions/qr', {
    body: { qrToken: slip.qrToken },
    status: 401,
  });
  await api('/guest-sessions/me', { token: session.sessionToken });
  await api('/guest-sessions/rooms/TEST-102', {
    token: session.sessionToken,
    status: 403,
  });
  const scope = await api('/guest-sessions/realtime-session', {
    token: session.sessionToken,
  });
  assert.equal(scope.bookingId, booking);
  assert.equal(scope.roomNumber, 'TEST-101');
  assert.equal(scope.role, 'GUEST');
  const request = await api('/service-requests', {
    token: session.sessionToken,
    status: 201,
    body: {
      requestType: 'TOILETRIES',
      description: 'Integration toiletries request',
      idempotencyKey: 'shared-stack-request-1',
    },
  });
  const tasks = await db.query(
    'SELECT t.*,r.source AS request_source FROM wkms_tasks t JOIN foss_service_requests r ON r.request_id=t.service_request_id WHERE r.idempotency_key=$1',
    ['shared-stack-request-1'],
  );
  assert.equal(tasks.rows.length, 1);
  assert.equal(tasks.rows[0].source, 'GUEST_APP');
  assert.equal(tasks.rows[0].category, 'TOILETRIES');
  await api('/service-requests', {
    token: session.sessionToken,
    status: 201,
    body: {
      requestType: 'TOILETRIES',
      description: 'Integration toiletries request',
      idempotencyKey: 'shared-stack-request-1',
    },
  });
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM wkms_tasks WHERE service_request_id=$1',
        [tasks.rows[0].service_request_id],
      )
    ).rows[0].n,
    1,
  );
  await db.query(
    "UPDATE wkms_tasks SET status='COMPLETED',completed_at=now(),updated_at=now() WHERE task_id=$1",
    [tasks.rows[0].task_id],
  );
  const list = await api('/service-requests', { token: session.sessionToken });
  assert.ok(
    list.some(
      (item) =>
        item.requestId === request.requestId && item.status === 'COMPLETED',
    ),
  );
  await api('/complaints', {
    token: session.sessionToken,
    status: 201,
    body: {
      category: 'NOISE',
      severity: 'MEDIUM',
      subject: 'Integration complaint',
      description: 'Synthetic isolated integration complaint.',
      idempotencyKey: 'shared-stack-complaint-1',
    },
  });
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM foss_complaints WHERE idempotency_key=$1',
        ['shared-stack-complaint-1'],
      )
    ).rows[0].n,
    1,
  );
  const slip2 = await api('/guest-sessions/internal/qr/issue', {
    internal: true,
    body: { bookingId: second, roomNumber: 'TEST-102' },
  });
  const session2 = await api('/guest-sessions/qr', {
    body: { qrToken: slip2.qrToken },
  });
  assert.deepEqual(
    await api('/complaints', { token: session2.sessionToken }),
    [],
  );
  await db.query(
    "UPDATE bookings SET status='CHECKED_OUT' WHERE booking_id=$1",
    [booking],
  );
  await api('/guest-sessions/internal/events/checkout', {
    internal: true,
    body: {
      eventId: 'integration-checkout',
      eventType: 'fds.guest.checkout',
      bookingId: booking,
      roomNumber: 'TEST-101',
      checkoutTime: new Date().toISOString(),
    },
  });
  await api('/guest-sessions/me', { token: session.sessionToken, status: 401 });
  await api('/guest-sessions/me', { token: session2.sessionToken });
  console.log(
    'PASS: real FDS verification, single-use QR, guest scope, WKMS task dispatch/idempotency/completion, shared MAD complaint intake, checkout revocation and independent stays.',
  );
} finally {
  await db.end();
}
