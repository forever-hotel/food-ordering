// Only the disposable stack: isolated gateway -> FOSS + shared WebSocket service.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../../frontend/package.json', import.meta.url),
);
const { io } = require('socket.io-client');
assert.equal(
  process.env.FOSS_DISPOSABLE_SOCKET_TEST,
  'true',
  'Explicit disposable-stack opt-in required',
);
const origin = 'http://127.0.0.1:18080';
async function call(path, body, token, internal = false) {
  const response = await fetch(
    (internal ? 'http://127.0.0.1:14004' : origin + '/foss') + path,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(internal
          ? {
              'x-internal-service-key':
                'local-foss-integration-service-key-at-least-32',
            }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  assert.equal(response.status, 200, `Gateway request failed: ${path}`);
  return response.json();
}
await call('/health/live');
const qr = await call(
  '/guest-sessions/internal/qr/issue',
  { bookingId: 'c2222222-2222-4222-8222-222222222222', roomNumber: 'TEST-102' },
  undefined,
  true,
);
const guest = await call('/guest-sessions/qr', { qrToken: qr.qrToken });
const ticket = await call(
  '/guest-sessions/realtime-ticket',
  {},
  guest.sessionToken,
);
assert.match(ticket.ticket, /^[\w-]{43}$/);
const socket = io(origin, {
  path: '/realtime/socket.io',
  transports: ['websocket'],
  auth: { ticket: ticket.ticket },
  reconnection: false,
  extraHeaders: { Origin: 'http://localhost:3004' },
  timeout: 5000,
});
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error('Gateway WebSocket handshake timed out')),
      10000,
    );
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  const disconnected = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error('Revoked guest socket was not disconnected')),
      12000,
    );
    socket.once('disconnect', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  await call('/guest-sessions/logout', {}, guest.sessionToken);
  await disconnected;
  console.log(
    'PASS: gateway REST routing, guest bearer forwarding, one-use ticket handshake through /realtime/socket.io, and logout socket revocation.',
  );
} finally {
  socket.disconnect();
}
