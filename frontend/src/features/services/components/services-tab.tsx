'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button, Card, Input, Tag, Typography, message } from 'antd';
import type {
  ServiceRequestResponse,
  ServiceRequestStatus,
  ServiceTypeOption,
} from '../../../types/services.ts';
import {
  SERVICE_TYPE_OPTIONS,
  createServiceRequest,
  fetchGuestServiceRequests,
  generateServiceIdempotencyKey,
  advanceServiceRequestStatusDemo,
} from '../../../lib/api/services.ts';
import { useAuth } from '../../../lib/auth/auth-context.tsx';
import {
  FossRealtimeClient,
  RealtimeEventType,
  type FossRealtimeEvent,
} from '../../../lib/realtime/realtime-client.ts';
import API_URL from '../../../lib/api/config.ts';
import { AlertNotice } from '../../../components/feedback/alert-notice.tsx';
import { LoadingSkeleton } from '../../../components/feedback/loading-skeleton.tsx';
import { EmptyState } from '../../../components/feedback/empty-state.tsx';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export function ServicesTab() {
  const { sessionToken, guest } = useAuth();

  const [selectedType, setSelectedType] = useState<ServiceTypeOption>(
    SERVICE_TYPE_OPTIONS[2], // Default to 'Maintenance' matching Figure 38
  );
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [requests, setRequests] = useState<ServiceRequestResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  // Single client-generated idempotency key retained across retry attempts
  const idempotencyKeyRef = useRef<string>(generateServiceIdempotencyKey());

  const loadRequests = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setFetchError(null);

      try {
        const data = await fetchGuestServiceRequests(sessionToken || 'demo-token');
        setRequests(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to retrieve service requests.';
        setFetchError(msg);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [sessionToken],
  );

  // Asynchronous initial fetch without synchronous setState in effect body
  useEffect(() => {
    let isCancelled = false;

    fetchGuestServiceRequests(sessionToken || 'demo-token')
      .then((data) => {
        if (!isCancelled) {
          setRequests(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : 'Unable to retrieve service requests.';
          setFetchError(msg);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [sessionToken]);

  // Real-time events & polling fallback
  const realtimeClientRef = useRef<FossRealtimeClient | null>(null);

  useEffect(() => {
    if (!sessionToken || !guest) return;

    const client = new FossRealtimeClient({
      apiUrl: API_URL,
      sessionToken,
      bookingId: guest.bookingId || 'booking-101',
      roomNumber: guest.roomNumber || '103',
      pollIntervalMs: 5000,
      onEvent: (event: FossRealtimeEvent) => {
        if (event.eventType === RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED) {
          const updated = event.data as ServiceRequestResponse;
          if (updated && updated.requestId) {
            setRequests((prev) => {
              const idx = prev.findIndex((r) => r.requestId === updated.requestId);
              if (idx > -1) {
                const next = [...prev];
                next[idx] = updated;
                return next;
              }
              return [updated, ...prev];
            });
          } else {
            loadRequests(false);
          }
        }
      },
    });

    client.connect();
    realtimeClientRef.current = client;

    return () => {
      client.disconnect();
    };
  }, [sessionToken, guest, loadRequests]);

  // Secondary polling fallback when there are in-flight (uncompleted) service requests
  useEffect(() => {
    const hasActiveRequests = requests.some(
      (r) => r.status === 'SUBMITTED' || r.status === 'ASSIGNED' || r.status === 'IN_PROGRESS',
    );
    if (!hasActiveRequests) return;

    const interval = setInterval(() => {
      loadRequests(false);
    }, 6000);

    return () => clearInterval(interval);
  }, [requests, loadRequests]);

  const handleSubmit = async () => {
    if (submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      requestType: selectedType.backendType,
      description: description.trim() || undefined,
      idempotencyKey: idempotencyKeyRef.current,
    };

    try {
      const newRequest = await createServiceRequest(
        sessionToken || 'demo-token',
        payload,
        idempotencyKeyRef.current,
      );

      // On verified success: reset form and generate new idempotency key
      setDescription('');
      idempotencyKeyRef.current = generateServiceIdempotencyKey();
      message.success(`Service request submitted for ${selectedType.label}.`);
      setRequests((prev) => [
        newRequest,
        ...prev.filter((r) => r.requestId !== newRequest.requestId),
      ]);
    } catch (err: unknown) {
      // Failure keeps input and retains idempotency key for retry
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to submit service request. Please check your connection and retry.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvanceStatus = async (requestId: string, targetStatus: ServiceRequestStatus) => {
    setAdvancingId(requestId);
    try {
      const updated = await advanceServiceRequestStatusDemo(
        sessionToken || 'demo-token',
        requestId,
        targetStatus,
        targetStatus === 'ASSIGNED'
          ? 'Worker en route'
          : targetStatus === 'COMPLETED'
            ? 'Amali S.'
            : undefined,
      );
      setRequests((prev) => prev.map((r) => (r.requestId === requestId ? updated : r)));
      message.info(`Demo: Request status updated to ${targetStatus}`);
    } catch {
      // Offline fallback state update
      setRequests((prev) =>
        prev.map((r) => {
          if (r.requestId !== requestId) return r;
          return {
            ...r,
            status: targetStatus,
            assignedStaff:
              targetStatus === 'ASSIGNED'
                ? 'Worker en route'
                : targetStatus === 'COMPLETED'
                  ? 'Amali S.'
                  : r.assignedStaff,
            timeline: r.timeline.map((step) => ({
              ...step,
              completed: step.status === targetStatus ? true : step.completed,
              current: step.status === targetStatus,
            })),
          };
        }),
      );
      message.info(`Demo simulation: status set to ${targetStatus}`);
    } finally {
      setAdvancingId(null);
    }
  };

  const getStatusBadge = (req: ServiceRequestResponse) => {
    const timeDisplay = req.createdAt
      ? new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '13:45';

    switch (req.status) {
      case 'ASSIGNED':
        return (
          <Tag color="gold" className="text-[11px] font-semibold mr-0 !rounded-full !px-2.5">
            ● Assigned · {timeDisplay}
          </Tag>
        );
      case 'IN_PROGRESS':
        return (
          <Tag color="warning" className="text-[11px] font-semibold mr-0 !rounded-full !px-2.5">
            ● In Progress · {timeDisplay}
          </Tag>
        );
      case 'COMPLETED':
        return (
          <Tag color="success" className="text-[11px] font-semibold mr-0 !rounded-full !px-2.5">
            ✓ Completed · {timeDisplay}
          </Tag>
        );
      case 'SUBMITTED':
      default:
        return (
          <Tag color="processing" className="text-[11px] font-semibold mr-0 !rounded-full !px-2.5">
            ● Submitted · {timeDisplay}
          </Tag>
        );
    }
  };

  const getCategoryLabel = (backendType: string) => {
    const matched = SERVICE_TYPE_OPTIONS.find((o) => o.backendType === backendType);
    if (matched) return matched.label;
    return backendType
      .replace('_', ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div
      role="tabpanel"
      id="tabpanel-services"
      aria-labelledby="nav-tab-services"
      className="w-full space-y-4 pb-24 animate-fade-in"
    >
      {/* WHAT DO YOU NEED? 2x3 Grid (Figure 38) */}
      <div>
        <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 px-1">
          WHAT DO YOU NEED?
        </Text>

        <div className="grid grid-cols-2 gap-2.5">
          {SERVICE_TYPE_OPTIONS.map((type) => {
            const isSelected = selectedType.key === type.key;

            return (
              <button
                key={type.key}
                type="button"
                aria-pressed={isSelected}
                disabled={submitting}
                onClick={() => setSelectedType(type)}
                className={`touch-target p-3.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-center border focus-visible:outline-2 focus-visible:outline-[#1D3557] active:scale-[0.98] ${
                  isSelected
                    ? 'bg-[#1D3557] text-white border-[#1D3557] shadow-sm scale-[1.01]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="text-2xl select-none" aria-hidden="true">
                  {type.icon}
                </span>
                <span className="text-xs font-semibold leading-tight">{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* DESCRIPTION (OPTIONAL) Card (Figure 38) */}
      <Card
        className="!rounded-3xl !border-slate-100 !bg-white !shadow-xs"
        styles={{ body: { padding: '16px 18px' } }}
      >
        <div className="flex items-center justify-between mb-2">
          <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            DESCRIPTION (OPTIONAL)
          </Text>
          <span
            className={`text-[11px] font-mono tabular-nums ${
              description.length >= 500 ? 'text-red-500 font-bold' : 'text-slate-400'
            }`}
          >
            {description.length}/500
          </span>
        </div>

        <TextArea
          rows={3}
          value={description}
          disabled={submitting}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. AC not cooling properly..."
          className="!rounded-2xl text-xs !bg-slate-50 !border-slate-200 focus:!bg-white"
        />

        {/* Submission Error Banner with Idempotent Retry */}
        {submitError && (
          <AlertNotice
            type="error"
            title="Service Request Submission Failed"
            message={submitError}
            onRetry={handleSubmit}
            className="mt-3"
          />
        )}

        <Button
          type="primary"
          block
          size="large"
          loading={submitting}
          disabled={submitting}
          onClick={handleSubmit}
          className="!h-12 !rounded-2xl !bg-[#1D3557] hover:!bg-[#162a45] active:scale-[0.99] !font-bold text-sm mt-4 shadow-md"
        >
          {submitting ? 'Submitting Request...' : 'Submit Request'}
        </Button>
      </Card>

      {/* ACTIVE REQUESTS (Figure 38) */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            ACTIVE REQUESTS
          </Text>
          <Button
            type="link"
            size="small"
            onClick={() => loadRequests(true)}
            className="text-[11px] text-[#1D3557] font-semibold !p-0 !h-auto"
          >
            Refresh
          </Button>
        </div>

        {/* Loading state */}
        {loading && requests.length === 0 && <LoadingSkeleton count={2} type="card" />}

        {/* Fetch Error state */}
        {fetchError && requests.length === 0 && (
          <AlertNotice
            type="error"
            title="Unable to load service requests"
            message={fetchError}
            onRetry={() => loadRequests(true)}
          />
        )}

        {/* Empty state */}
        {!loading && requests.length === 0 && !fetchError && (
          <EmptyState
            icon="🛎️"
            title="No service requests"
            description="You have not submitted any service requests for your room stay yet."
          />
        )}

        {/* Requests List */}
        <div className="space-y-2.5">
          {requests.map((req) => {
            const isExpanded = expandedRequestId === req.requestId;

            return (
              <Card
                key={req.requestId}
                onClick={() => setExpandedRequestId(isExpanded ? null : req.requestId)}
                className="!rounded-2xl !border-slate-100 !bg-white !shadow-xs hover:border-slate-200 active:scale-[0.99] transition-all cursor-pointer"
                styles={{ body: { padding: '14px 16px' } }}
              >
                <div className="flex items-center justify-between mb-1">
                  <Title level={4} className="!text-sm !font-bold !text-[#1E293B] !mb-0">
                    {getCategoryLabel(req.requestType)}
                  </Title>
                  {getStatusBadge(req)}
                </div>

                {/* Subtitle matching Figure 38 */}
                {req.status === 'ASSIGNED' && (
                  <Paragraph className="!text-xs !text-amber-800 !mb-0 font-medium">
                    Worker en route → <strong className="font-bold">In Progress</strong>
                  </Paragraph>
                )}
                {req.status === 'IN_PROGRESS' && (
                  <Paragraph className="!text-xs !text-amber-700 !mb-0 font-medium">
                    Staff working on your request (Est. ~{req.estimatedCompletionMinutes || 15}m)
                  </Paragraph>
                )}
                {req.status === 'COMPLETED' && (
                  <Paragraph className="!text-xs !text-slate-500 !mb-0">
                    Completed {req.assignedStaff ? `by ${req.assignedStaff}` : ''}
                  </Paragraph>
                )}
                {req.status === 'SUBMITTED' && (
                  <Paragraph className="!text-xs !text-slate-500 !mb-0">
                    Request received by housekeeping desk
                  </Paragraph>
                )}

                {req.description && (
                  <div className="mt-1 text-[11px] text-slate-400 truncate">
                    Note: {req.description}
                  </div>
                )}

                {/* Expandable 4-Stage Progression Timeline */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 animate-fade-in">
                    <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      TASK PROGRESSION
                    </Text>
                    <div className="space-y-1.5 text-xs">
                      {(req.timeline || []).map((step) => (
                        <div key={step.status} className="flex items-center justify-between">
                          <span
                            className={`flex items-center gap-1.5 font-medium ${
                              step.completed
                                ? 'text-slate-800'
                                : step.current
                                  ? 'text-amber-700 font-bold'
                                  : 'text-slate-400'
                            }`}
                          >
                            <span aria-hidden="true">{step.completed ? '✓' : '○'}</span>
                            {step.label}
                          </span>
                          {step.timestamp && (
                            <span className="text-[11px] text-slate-400">{step.timestamp}</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Demo status advancement buttons for evaluation */}
                    <div className="pt-2 flex items-center gap-1.5 justify-end">
                      {req.status !== 'IN_PROGRESS' && req.status !== 'COMPLETED' && (
                        <Button
                          size="small"
                          disabled={advancingId === req.requestId}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdvanceStatus(req.requestId, 'IN_PROGRESS');
                          }}
                          className="text-[11px] !rounded-lg"
                        >
                          Demo: In Progress
                        </Button>
                      )}
                      {req.status !== 'COMPLETED' && (
                        <Button
                          size="small"
                          disabled={advancingId === req.requestId}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdvanceStatus(req.requestId, 'COMPLETED');
                          }}
                          className="text-[11px] !rounded-lg"
                        >
                          Demo: Complete
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
