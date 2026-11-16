import API_URL from '../config.ts';
import { ApiError } from '../api-error.ts';
import type { ServicesProvider } from '../interfaces.ts';
import type {
  ServiceRequestResponse,
  CreateServiceRequestPayload,
  ServiceRequestStatus,
} from '../../../types/services.ts';

function assertRealSessionToken(sessionToken: string | undefined, _actionDesc?: string): void {
  if (sessionToken !== undefined && sessionToken.trim() === '') {
    throw new ApiError(
      `Guest session token is required to ${_actionDesc || 'perform action'}.`,
      401,
    );
  }
  if (
    sessionToken &&
    (sessionToken.startsWith('demo-token-') ||
      ['101', '102', '103', '204', '999'].includes(sessionToken))
  ) {
    throw new ApiError(
      'Demonstration session tokens cannot be transmitted to real API endpoints.',
      401,
    );
  }
}

function buildHeaders(
  sessionToken?: string,
  extraHeaders: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-foss-client': 'foss-web',
    ...extraHeaders,
  };
  if (sessionToken && sessionToken !== '__COOKIE_SESSION__') {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  return headers;
}

export class ApiServicesProvider implements ServicesProvider {
  async fetchGuestServiceRequests(sessionToken?: string): Promise<ServiceRequestResponse[]> {
    assertRealSessionToken(sessionToken, 'fetch service requests');

    try {
      const response = await fetch(`${API_URL}/service-requests`, {
        method: 'GET',
        headers: buildHeaders(sessionToken),
        credentials: 'include',
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = body?.message || body?.error || 'Failed to fetch guest service requests.';
        throw new ApiError(errorMsg, response.status, body);
      }

      if (Array.isArray(body)) {
        return body as ServiceRequestResponse[];
      }
      if (body && Array.isArray(body.requests)) {
        return body.requests as ServiceRequestResponse[];
      }
      return [];
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      const msg =
        err instanceof Error ? err.message : 'Unable to connect to service requests service.';
      throw new ApiError(msg, 503);
    }
  }

  async fetchGuestServiceRequestById(
    sessionToken: string | undefined,
    requestId: string,
  ): Promise<ServiceRequestResponse> {
    assertRealSessionToken(sessionToken, 'fetch service request details');

    try {
      const response = await fetch(`${API_URL}/service-requests/${encodeURIComponent(requestId)}`, {
        method: 'GET',
        headers: buildHeaders(sessionToken),
        credentials: 'include',
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg =
          body?.message ||
          body?.error ||
          `Service request ${requestId} was not found or access was forbidden.`;
        throw new ApiError(errorMsg, response.status, body);
      }

      return body as ServiceRequestResponse;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      const msg =
        err instanceof Error ? err.message : 'Unable to retrieve service request details.';
      throw new ApiError(msg, 503);
    }
  }

  async createServiceRequest(
    sessionToken: string | undefined,
    payload: CreateServiceRequestPayload,
    idempotencyKey?: string,
  ): Promise<ServiceRequestResponse> {
    assertRealSessionToken(sessionToken, 'submit a service request');

    const effectiveKey =
      idempotencyKey ||
      payload.idempotencyKey ||
      `idemp-svc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const requestBody = {
      requestType: payload.requestType,
      description: payload.description?.trim() || undefined,
      priority: payload.priority || 'NORMAL',
      idempotencyKey: effectiveKey,
    };

    try {
      const response = await fetch(`${API_URL}/service-requests`, {
        method: 'POST',
        headers: buildHeaders(sessionToken, {
          'Content-Type': 'application/json',
          'idempotency-key': effectiveKey,
          'x-idempotency-key': effectiveKey,
        }),
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg =
          body?.message || body?.error || 'Failed to submit service request. Please try again.';
        throw new ApiError(errorMsg, response.status, body);
      }

      return body as ServiceRequestResponse;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to submit service request due to a network issue.';
      throw new ApiError(msg, 503);
    }
  }

  async advanceDemoServiceRequestStatus(
    sessionToken: string,
    requestId: string,
    newStatus: ServiceRequestStatus,
    assignedStaff?: string,
  ): Promise<ServiceRequestResponse> {
    const response = await fetch(
      `${API_URL}/service-requests/${encodeURIComponent(requestId)}/status`,
      {
        method: 'POST',
        headers: buildHeaders(sessionToken, {
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify({
          status: newStatus,
          assignedStaff,
        }),
      },
    );

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg =
        body?.message || body?.error || 'Failed to advance demo service request status.';
      throw new ApiError(errorMsg, response.status, body);
    }

    return body as ServiceRequestResponse;
  }
}
