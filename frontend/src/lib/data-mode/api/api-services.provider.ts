import API_URL from '../config.ts';
import { ApiError } from '../api-error.ts';
import type { ServicesProvider } from '../interfaces.ts';
import type {
  ServiceRequestResponse,
  CreateServiceRequestPayload,
  ServiceRequestStatus,
} from '../../../types/services.ts';

export class ApiServicesProvider implements ServicesProvider {
  async fetchGuestServiceRequests(sessionToken: string): Promise<ServiceRequestResponse[]> {
    if (!sessionToken || sessionToken.trim() === '') {
      throw new ApiError('Guest session token is required to fetch service requests.', 401);
    }

    try {
      const response = await fetch(`${API_URL}/service-requests`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
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
    sessionToken: string,
    requestId: string,
  ): Promise<ServiceRequestResponse> {
    if (!sessionToken || sessionToken.trim() === '') {
      throw new ApiError('Guest session token is required to fetch service request details.', 401);
    }

    try {
      const response = await fetch(`${API_URL}/service-requests/${encodeURIComponent(requestId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
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
    sessionToken: string,
    payload: CreateServiceRequestPayload,
    idempotencyKey?: string,
  ): Promise<ServiceRequestResponse> {
    if (!sessionToken || sessionToken.trim() === '') {
      throw new ApiError('Guest session token is required to submit a service request.', 401);
    }

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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
          'idempotency-key': effectiveKey,
        },
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
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
