import { NextRequest, NextResponse } from 'next/server.js';

/**
 * Server-side development proxy for demo token retrieval.
 *
 * Security Requirements:
 * 1. Strictly disabled in production or when DEMO_MODE is not true (fails closed with 404).
 * 2. Never exposes DEV_DEMO_KEY to the client bundle or browser-visible traffic.
 * 3. Enforces strict same-origin requests (rejects cross-site Sec-Fetch-Site).
 * 4. Rejects untrusted forwarded headers (x-forwarded-for, x-forwarded-host, x-forwarded-proto).
 * 5. Rejects non-localhost host headers.
 * 6. Fails closed if DEV_DEMO_KEY is unconfigured.
 */
export async function GET(request: NextRequest) {
  // 1. Strict production and demo mode guard
  const isDevOrDemo = process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true';

  if (!isDevOrDemo) {
    return new NextResponse(null, { status: 404 });
  }

  // 2. Reject untrusted forwarded headers from public proxies or gateways
  const hasForwardedHeaders = Boolean(
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-forwarded-host') ||
    request.headers.get('x-forwarded-proto'),
  );

  if (hasForwardedHeaders) {
    return NextResponse.json(
      { error: 'Forwarded requests are strictly rejected by development proxy.' },
      { status: 403 },
    );
  }

  // 3. Enforce same-origin browser request policy
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return NextResponse.json({ error: 'Cross-origin requests are rejected.' }, { status: 403 });
  }

  // 4. Host validation (must target localhost or loopback)
  const host = (request.headers.get('host') || '').toLowerCase();
  const isLocalHost =
    host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');

  if (!isLocalHost) {
    return NextResponse.json(
      { error: 'Development proxy is restricted to local hosts.' },
      { status: 403 },
    );
  }

  // 5. Require server-side developer authorization key
  const devDemoKey = process.env.DEV_DEMO_KEY;
  if (!devDemoKey) {
    return NextResponse.json({ error: 'Server developer key is not configured.' }, { status: 403 });
  }

  // 6. Proxy server-to-server to internal backend with authorization key
  const backendBaseUrl =
    process.env.INTERNAL_API_URL ||
    (process.env.NODE_ENV === 'production' ? 'http://backend:4300' : 'http://127.0.0.1:4300');

  try {
    const backendRes = await fetch(`${backendBaseUrl}/guest-sessions/demo-tokens`, {
      method: 'GET',
      headers: {
        'x-developer-key': devDemoKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: 'Backend rejected demo tokens authorization.' },
        { status: backendRes.status },
      );
    }

    const data = await backendRes.json();
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, private',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to connect to internal backend.' }, { status: 502 });
  }
}
