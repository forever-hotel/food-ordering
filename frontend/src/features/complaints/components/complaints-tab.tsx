'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { App, Button, Card, Input, Select, Tag, Typography } from 'antd';
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-4 h-4 text-emerald-600'}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-4 h-4 text-amber-500 animate-pulse'}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
    </svg>
  );
}

function ShieldAlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-4 h-4 text-slate-700'}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4M12 16h.01"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-3 h-3'}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-3 h-3'}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.286L13 21l-2.286-6.714L5 12l5.714-2.286L13 3z"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-3 h-3'}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-3 h-3'}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  );
}
import type {
  ComplaintCategory,
  ComplaintSeverity,
  ComplaintStatus,
  ComplaintResponse,
  CreateComplaintPayload,
  SourceReferenceOption,
} from '../../../types/complaints.ts';
import type { FoodOrderResponse } from '../../../types/orders.ts';
import type { ServiceRequestResponse } from '../../../types/services.ts';
import {
  COMPLAINT_CATEGORY_OPTIONS,
  COMPLAINT_SEVERITY_OPTIONS,
  createComplaint,
  fetchGuestComplaints,
  generateComplaintIdempotencyKey,
  advanceComplaintStatusDemo,
} from '../../../lib/api/complaints.ts';
import { fetchGuestOrders } from '../../../lib/api/orders.ts';
import { fetchGuestServiceRequests, SERVICE_TYPE_OPTIONS } from '../../../lib/api/services.ts';
import { getDataMode } from '../../../lib/data-mode/data-mode.ts';
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

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

export function ComplaintsTab() {
  const { message } = App.useApp();
  const { sessionToken, guest } = useAuth();

  // Form State: initialized without hard-coded guest data
  const [category, setCategory] = useState<ComplaintCategory>('FOOD');
  const [severity, setSeverity] = useState<ComplaintSeverity>('LOW');
  const [reference, setReference] = useState<string>('none');
  const [subject, setSubject] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Dynamic Stay References (Orders & Service Requests)
  const [guestOrders, setGuestOrders] = useState<FoodOrderResponse[]>([]);
  const [guestRequests, setGuestRequests] = useState<ServiceRequestResponse[]>([]);
  const [referencesLoading, setReferencesLoading] = useState<boolean>(false);

  // Complaints History & Realtime State
  const [complaints, setComplaints] = useState<ComplaintResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedComplaintId, setExpandedComplaintId] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  // Active session and request sequence tracking to prevent session-switching race conditions
  const activeSessionTokenRef = useRef<string | null>(sessionToken);
  const activeBookingIdRef = useRef<string | null>(guest?.bookingId || null);
  const complaintSeqRef = useRef<number>(0);
  const referenceSeqRef = useRef<number>(0);

  // Synchronize session references when guest or session token changes
  useEffect(() => {
    activeSessionTokenRef.current = sessionToken;
    activeBookingIdRef.current = guest?.bookingId || null;
    complaintSeqRef.current += 1;
    referenceSeqRef.current += 1;

    // Immediately clear guest data when session is revoked or switched
    if (!sessionToken || !guest) {
      Promise.resolve().then(() => {
        setComplaints([]);
        setGuestOrders([]);
        setGuestRequests([]);
        setReference('none');
        setSubject('');
        setDescription('');
        setFetchError(null);
        setLoading(false);
      });
    }
  }, [sessionToken, guest]);

  // Single client-generated idempotency key retained across retry attempts
  const idempotencyKeyRef = useRef<string>(generateComplaintIdempotencyKey());

  // Dynamically mapped source options strictly scoped to the active guest booking
  const sourceOptions: SourceReferenceOption[] = useMemo(() => {
    // Always provide No reference option first as default
    const options: SourceReferenceOption[] = [
      {
        id: 'none',
        type: 'none',
        label: 'No reference',
      },
    ];

    // Map genuine guest orders belonging to active booking
    guestOrders.forEach((o) => {
      // Robustly strip any existing prefixes ('order-', 'ord-', '#') to extract the core identifier
      const bareOrderId = o.orderId.replace(/^order-/i, '').replace(/^#/, '');
      const cleanOrderNum = bareOrderId.toUpperCase().startsWith('ORD-')
        ? bareOrderId.slice(4)
        : bareOrderId;
      const orderNum = `#ORD-${cleanOrderNum}`;
      const itemsDesc =
        o.items && o.items.length > 0
          ? o.items
              .map((i) => i.name)
              .slice(0, 2)
              .join(', ') + (o.items.length > 2 ? '...' : '')
          : 'Food Order';
      const amountStr =
        typeof o.totalAmount === 'number' ? `, LKR ${o.totalAmount.toLocaleString()}` : '';

      const optionId = o.orderId.startsWith('order-') ? o.orderId : `order-${o.orderId}`;
      options.push({
        id: optionId,
        type: 'order',
        referenceId: o.orderId,
        label: `Order ${orderNum} — ${itemsDesc}${amountStr}`,
      });
    });

    // Map genuine guest service requests belonging to active booking
    guestRequests.forEach((r) => {
      // Robustly strip any existing prefixes ('req-', 'request-', '#') to extract the core identifier
      const bareReqId = r.requestId.replace(/^req(uest)?-/i, '').replace(/^#/, '');
      const cleanReqNum = bareReqId.toUpperCase().startsWith('REQ-')
        ? bareReqId.slice(4)
        : bareReqId;
      const reqNum = `#REQ-${cleanReqNum}`;
      const typeOption = SERVICE_TYPE_OPTIONS.find(
        (opt) => opt.backendType === r.requestType || opt.key === r.requestType,
      );
      const typeLabel = typeOption?.label || r.requestType || 'Service Request';
      const descSnippet = r.description?.trim()
        ? ` (${r.description.trim().slice(0, 24)}${r.description.trim().length > 24 ? '...' : ''})`
        : '';

      const optionId = r.requestId.startsWith('req-') ? r.requestId : `req-${r.requestId}`;
      options.push({
        id: optionId,
        type: 'request',
        referenceId: r.requestId,
        label: `Request ${reqNum} — ${typeLabel}${descSnippet}`,
      });
    });

    return options;
  }, [guestOrders, guestRequests]);

  // Reset selected reference if it is no longer valid for the active booking
  useEffect(() => {
    if (
      reference !== 'none' &&
      !sourceOptions.some((o) => o.id === reference || o.referenceId === reference)
    ) {
      Promise.resolve().then(() => {
        setReference('none');
      });
    }
  }, [reference, sourceOptions]);

  const loadReferences = useCallback(async () => {
    if (!sessionToken || !guest?.bookingId) {
      setGuestOrders([]);
      setGuestRequests([]);
      return;
    }

    const currentSeq = ++referenceSeqRef.current;
    const currentToken = sessionToken;
    const currentBookingId = guest.bookingId;
    const currentRoomNumber = guest.roomNumber;

    setReferencesLoading(true);
    try {
      const [ordersRes, requestsRes] = await Promise.allSettled([
        fetchGuestOrders(currentToken),
        fetchGuestServiceRequests(currentToken),
      ]);

      // Guard against stale response if session switched during request
      if (
        referenceSeqRef.current !== currentSeq ||
        activeSessionTokenRef.current !== currentToken ||
        activeBookingIdRef.current !== currentBookingId
      ) {
        return;
      }

      if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
        setGuestOrders(
          ordersRes.value.filter(
            (o) =>
              o.bookingId === currentBookingId &&
              (!currentRoomNumber || o.roomNumber === currentRoomNumber),
          ),
        );
      } else {
        setGuestOrders([]);
      }

      if (requestsRes.status === 'fulfilled' && Array.isArray(requestsRes.value)) {
        setGuestRequests(
          requestsRes.value.filter(
            (r) =>
              r.bookingId === currentBookingId &&
              (!currentRoomNumber || r.roomNumber === currentRoomNumber),
          ),
        );
      } else {
        setGuestRequests([]);
      }
    } catch {
      if (
        referenceSeqRef.current === currentSeq &&
        activeSessionTokenRef.current === currentToken
      ) {
        setGuestOrders([]);
        setGuestRequests([]);
      }
    } finally {
      if (
        referenceSeqRef.current === currentSeq &&
        activeSessionTokenRef.current === currentToken
      ) {
        setReferencesLoading(false);
      }
    }
  }, [sessionToken, guest]);

  const loadComplaints = useCallback(
    async (showLoading = false) => {
      if (!sessionToken || !guest) {
        if (showLoading) setLoading(false);
        return;
      }

      const currentSeq = ++complaintSeqRef.current;
      const currentToken = sessionToken;

      if (showLoading) setLoading(true);
      setFetchError(null);

      try {
        const data = await fetchGuestComplaints(currentToken);
        // Guard against stale response if session switched during request
        if (
          complaintSeqRef.current !== currentSeq ||
          activeSessionTokenRef.current !== currentToken
        ) {
          return;
        }
        setComplaints(data);
      } catch (err: unknown) {
        if (
          complaintSeqRef.current !== currentSeq ||
          activeSessionTokenRef.current !== currentToken
        ) {
          return;
        }
        const msg = err instanceof Error ? err.message : 'Unable to retrieve complaints.';
        setFetchError(msg);
      } finally {
        if (
          showLoading &&
          complaintSeqRef.current === currentSeq &&
          activeSessionTokenRef.current === currentToken
        ) {
          setLoading(false);
        }
      }
    },
    [sessionToken, guest],
  );

  // Asynchronous initial fetch without synchronous setState in effect body (React 19 compliant)
  useEffect(() => {
    let isCancelled = false;

    if (!sessionToken || !guest) {
      Promise.resolve().then(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });
      return () => {
        isCancelled = true;
      };
    }

    const currentToken = sessionToken;
    const currentSeq = ++complaintSeqRef.current;

    Promise.resolve().then(() => {
      if (!isCancelled) {
        void loadReferences();
      }
    });

    fetchGuestComplaints(currentToken)
      .then((data) => {
        if (
          !isCancelled &&
          complaintSeqRef.current === currentSeq &&
          activeSessionTokenRef.current === currentToken
        ) {
          setComplaints(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (
          !isCancelled &&
          complaintSeqRef.current === currentSeq &&
          activeSessionTokenRef.current === currentToken
        ) {
          const msg = err instanceof Error ? err.message : 'Unable to retrieve complaints.';
          setFetchError(msg);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [sessionToken, guest, loadReferences]);

  // Real-time events & polling fallback
  const realtimeClientRef = useRef<FossRealtimeClient | null>(null);

  useEffect(() => {
    if (!sessionToken || !guest?.bookingId || !guest?.roomNumber) return;

    const client = new FossRealtimeClient({
      apiUrl: API_URL,
      onRefresh: () => {
        void loadComplaints(false);
      },
      sessionToken,
      bookingId: guest.bookingId,
      roomNumber: guest.roomNumber,
      pollIntervalMs: 5000,
      onEvent: (event: FossRealtimeEvent) => {
        if (event.eventType === RealtimeEventType.COMPLAINT_STATUS_UPDATED) {
          const payload = event.data as {
            complaintId?: string;
            status?: ComplaintStatus;
            assignedManager?: string;
            resolutionNotes?: string;
          };

          if (!payload?.complaintId) return;

          setComplaints((prev) =>
            prev.map((c) => {
              if (c.complaintId !== payload.complaintId) return c;
              return {
                ...c,
                status: payload.status || c.status,
                assignedManager: payload.assignedManager || c.assignedManager,
                resolutionNotes: payload.resolutionNotes || c.resolutionNotes,
                updatedAt: new Date().toISOString(),
                timeline: c.timeline.map((step) => {
                  if (step.status === payload.status) {
                    return { ...step, completed: true, current: true, timestamp: 'Just now' };
                  }
                  return step;
                }),
              };
            }),
          );

          message.info(`Complaint [${payload.complaintId}] updated: ${payload.status}`);
        }
      },
    });

    realtimeClientRef.current = client;
    client.connect();

    // 10s polling fallback
    const pollInterval = setInterval(() => {
      loadComplaints(false).catch(() => {});
    }, 10000);

    return () => {
      clearInterval(pollInterval);
      client.disconnect();
    };
  }, [sessionToken, guest, loadComplaints, message]);

  // Submission Handler
  const handleSubmit = async () => {
    setSubmitError(null);

    const trimmedDesc = description.trim();
    if (trimmedDesc.length < 10) {
      setSubmitError('Please provide at least 10 characters describing the issue.');
      message.error('Please provide at least 10 characters describing the issue.');
      return;
    }
    if (trimmedDesc.length > 1000) {
      setSubmitError('Description cannot exceed 1000 characters.');
      message.error('Description cannot exceed 1000 characters.');
      return;
    }

    const opt = COMPLAINT_CATEGORY_OPTIONS.find((c) => c.value === category);
    const defaultSubject = opt ? `${opt.label} concern` : `${category} concern`;
    const trimmedSubject = subject.trim() || defaultSubject;
    if (trimmedSubject.length < 3 || trimmedSubject.length > 150) {
      setSubmitError('Subject must be between 3 and 150 characters.');
      message.error('Subject must be between 3 and 150 characters.');
      return;
    }

    setSubmitting(true);

    const selectedRef = sourceOptions.find(
      (o) => o.id === reference || o.referenceId === reference,
    );
    const relatedOrderId = selectedRef?.type === 'order' ? selectedRef.referenceId : undefined;
    const relatedRequestId = selectedRef?.type === 'request' ? selectedRef.referenceId : undefined;

    const payload: CreateComplaintPayload = {
      category,
      severity,
      subject: trimmedSubject,
      description: trimmedDesc,
      relatedOrderId,
      relatedRequestId,
      idempotencyKey: idempotencyKeyRef.current,
    };

    if (!sessionToken || !guest?.bookingId || !guest?.roomNumber) {
      setSubmitError('Active verified guest session is required to submit a complaint.');
      setSubmitting(false);
      return;
    }

    try {
      const result = await createComplaint(payload, sessionToken, idempotencyKeyRef.current);

      // Successfully submitted - update complaint list
      setComplaints((prev) => [
        result,
        ...prev.filter((c) => c.complaintId !== result.complaintId),
      ]);
      setExpandedComplaintId(result.complaintId);

      // Reset form and regenerate idempotency key for subsequent complaint
      setDescription('');
      setSubject('');
      setReference('none');
      setSeverity('LOW');
      idempotencyKeyRef.current = generateComplaintIdempotencyKey();

      message.success(`Complaint [${result.complaintId}] submitted. Escalated to Duty Manager.`, 4);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit complaint.';
      setSubmitError(msg);
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Demo Status Advancement Stepper for Evaluators (strictly demo mode only)
  const handleAdvanceStatus = async (complaintId: string, currentStatus: ComplaintStatus) => {
    if (getDataMode() !== 'demo') {
      message.error('Complaint status updates can only be performed by hotel staff/management.');
      return;
    }
    if (!sessionToken) return;

    let nextStatus: ComplaintStatus = 'UNDER_INVESTIGATION';
    if (currentStatus === 'SUBMITTED') nextStatus = 'UNDER_INVESTIGATION';
    else if (currentStatus === 'UNDER_INVESTIGATION') nextStatus = 'ESCALATED';
    else if (currentStatus === 'ESCALATED') nextStatus = 'RESOLVED';
    else return;

    setAdvancingId(complaintId);
    try {
      const updated = await advanceComplaintStatusDemo(
        complaintId,
        nextStatus,
        sessionToken,
        `Evaluator simulation: advanced from ${currentStatus} to ${nextStatus}.`,
      );

      setComplaints((prev) =>
        prev.map((c) => (c.complaintId === complaintId ? { ...c, ...updated } : c)),
      );
      message.success(`Status updated to ${nextStatus}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to advance status.';
      message.error(msg);
    } finally {
      setAdvancingId(null);
    }
  };

  const renderStatusBadge = (status: ComplaintStatus) => {
    switch (status) {
      case 'SUBMITTED':
        return (
          <Tag className="!border-blue-200 !bg-blue-50 !text-blue-700 !font-semibold !rounded-full !px-2.5 !py-0.5 text-xs">
            ● Submitted
          </Tag>
        );
      case 'UNDER_INVESTIGATION':
        return (
          <Tag className="!border-amber-200 !bg-amber-50 !text-amber-700 !font-semibold !rounded-full !px-2.5 !py-0.5 text-xs">
            ● Under Investigation
          </Tag>
        );
      case 'ESCALATED':
        return (
          <Tag className="!border-purple-200 !bg-purple-50 !text-purple-700 !font-semibold !rounded-full !px-2.5 !py-0.5 text-xs">
            ▲ Escalated to GM
          </Tag>
        );
      case 'RESOLVED':
        return (
          <Tag className="!border-emerald-200 !bg-emerald-50 !text-emerald-700 !font-semibold !rounded-full !px-2.5 !py-0.5 text-xs">
            ✓ Resolved
          </Tag>
        );
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const renderSeverityBadge = (sev: ComplaintSeverity) => {
    switch (sev) {
      case 'LOW':
        return (
          <Tag className="!border-emerald-200 !bg-emerald-50 !text-emerald-700 !font-medium !rounded-md text-[11px]">
            Low Severity
          </Tag>
        );
      case 'MEDIUM':
        return (
          <Tag className="!border-amber-200 !bg-amber-50 !text-amber-700 !font-medium !rounded-md text-[11px]">
            Medium Severity
          </Tag>
        );
      case 'HIGH':
        return (
          <Tag className="!border-red-200 !bg-red-50 !text-red-700 !font-bold !rounded-md text-[11px]">
            High Severity ✓
          </Tag>
        );
      case 'URGENT':
        return (
          <Tag className="!border-rose-300 !bg-rose-100 !text-rose-900 !font-extrabold !rounded-md text-[11px]">
            ⚠️ Urgent Severity
          </Tag>
        );
      default:
        return <Tag>{sev}</Tag>;
    }
  };

  if (!sessionToken || !guest) {
    return (
      <div className="w-full py-8 text-center">
        <EmptyState
          title="Guest Session Required"
          description="Please scan your room QR code to view and file complaints."
        />
      </div>
    );
  }

  return (
    <div
      role="tabpanel"
      id="tabpanel-complaints"
      aria-labelledby="nav-tab-complaints"
      className="w-full space-y-4 pb-24"
    >
      {submitError && (
        <AlertNotice
          type="error"
          title="Submission Failed"
          message={submitError}
          onRetry={handleSubmit}
        />
      )}

      {/* Main Complaint Form Card (Figure 39) */}
      <Card
        className="!rounded-2xl !border-slate-100 !bg-white !shadow-xs"
        styles={{ body: { padding: '20px 16px' } }}
      >
        {/* 1. Category Selector */}
        <div className="mb-4">
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            COMPLAINT CATEGORY
          </Text>
          <Select
            value={category}
            onChange={(val) => {
              const newCategory = val as ComplaintCategory;
              setCategory(newCategory);
              // Auto-adjust default subject if empty or default pattern
              if (
                !subject ||
                COMPLAINT_CATEGORY_OPTIONS.some(
                  (c) => subject === `${c.label} concern` || subject === `${c.value} concern`,
                )
              ) {
                const opt = COMPLAINT_CATEGORY_OPTIONS.find((c) => c.value === newCategory);
                if (opt) setSubject(`${opt.label} concern`);
              }
            }}
            className="w-full !rounded-xl !h-10 text-xs"
            options={COMPLAINT_CATEGORY_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.label,
            }))}
          />
        </div>

        {/* 2. Severity Level Selector (Figure 39) */}
        <div className="mb-4">
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            SEVERITY LEVEL
          </Text>
          <div className="grid grid-cols-3 gap-2">
            {COMPLAINT_SEVERITY_OPTIONS.slice(0, 3).map((s) => {
              const isSelected = severity === s.level;

              return (
                <button
                  key={s.level}
                  type="button"
                  onClick={() => setSeverity(s.level)}
                  className={`touch-target py-2 rounded-xl text-xs font-bold transition-all border focus-visible:outline-2 focus-visible:outline-[#1D3557] ${
                    isSelected
                      ? `${s.activeBg} ${s.activeText} shadow-xs border-transparent`
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  aria-pressed={isSelected}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Link to Order or Request (Optional) */}
        <div className="mb-4 min-w-0">
          <label
            htmlFor="complaint-reference-select"
            className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5"
          >
            LINK TO ORDER OR REQUEST (OPTIONAL)
          </label>
          <Select
            id="complaint-reference-select"
            aria-label="Link to order or request (optional)"
            value={reference}
            onChange={(val) => setReference(val as string)}
            loading={referencesLoading}
            popupMatchSelectWidth={true}
            className="w-full !rounded-xl !h-10 text-xs [&_.ant-select-selection-item]:truncate"
            optionRender={(option) => (
              <span className="block whitespace-normal break-words text-xs leading-snug py-0.5">
                {option.label}
              </span>
            )}
            options={sourceOptions.map((opt) => ({
              value: opt.id,
              label: opt.label,
            }))}
          />
        </div>

        {/* 4. Description Textarea (Figure 39) */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              DESCRIPTION
            </Text>
            <span className="text-[11px] text-slate-400">{description.length}/1000</span>
          </div>
          <TextArea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            placeholder="Please detail your experience so management can resolve it promptly..."
            className="!rounded-xl text-xs !bg-slate-50 !border-slate-200"
          />
        </div>

        {/* 5. Submit Complaint Action Button */}
        <Button
          type="primary"
          block
          size="large"
          loading={submitting}
          disabled={submitting}
          onClick={handleSubmit}
          className="!h-11 !rounded-xl !bg-[#1D3557] hover:!bg-[#162a45] !font-bold text-sm shadow-xs"
        >
          {submitting ? 'Submitting to Management...' : 'Submit Complaint'}
        </Button>
      </Card>

      {/* Informational Disclaimer Banner (Figure 39) */}
      <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-center">
        <Paragraph className="!text-[11px] !text-slate-500 !mb-0 leading-relaxed">
          A unique complaint reference will be generated. The hotel manager will review and respond
          directly to your stay.
        </Paragraph>
      </div>

      {/* Active & Historical Complaints List */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5">
            <ShieldAlertIcon className="w-4 h-4 text-slate-700" />
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Stay Complaints & Tracking
            </Text>
          </div>
          <Button
            type="text"
            size="small"
            icon={<RefreshIcon className={loading || referencesLoading ? 'animate-spin' : ''} />}
            onClick={() => {
              void loadComplaints(true);
              void loadReferences();
            }}
            className="!text-slate-500 text-xs"
          >
            Refresh
          </Button>
        </div>

        {loading && complaints.length === 0 ? (
          <LoadingSkeleton count={2} type="card" />
        ) : fetchError && complaints.length === 0 ? (
          <AlertNotice
            type="warning"
            title="Offline Mode"
            message={fetchError}
            onRetry={() => {
              void loadComplaints(true);
              void loadReferences();
            }}
          />
        ) : complaints.length === 0 ? (
          <EmptyState
            title="No complaints submitted yet."
            description="Your complaints and their progress will appear here once submitted."
          />
        ) : (
          <div className="space-y-3">
            {complaints.map((item) => {
              const isExpanded = expandedComplaintId === item.complaintId;

              return (
                <Card
                  key={item.complaintId}
                  className="!rounded-2xl !border-slate-100 !bg-white !shadow-xs overflow-hidden"
                  styles={{ body: { padding: '16px' } }}
                >
                  {/* Complaint Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {item.complaintId}
                        </span>
                        {renderSeverityBadge(item.severity)}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Room {item.roomNumber} ·{' '}
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {renderStatusBadge(item.status)}
                  </div>

                  {/* Subject and Description */}
                  <div className="mb-2.5">
                    <Text className="text-xs font-bold text-slate-800 block mb-0.5">
                      {item.subject}
                    </Text>
                    <Paragraph
                      className="!text-xs !text-slate-600 !mb-0 leading-relaxed"
                      ellipsis={isExpanded ? false : { rows: 2 }}
                    >
                      {item.description}
                    </Paragraph>
                  </div>

                  {/* Linked Reference & Manager Subtext */}
                  <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-slate-100 text-[11px] text-slate-500">
                    {item.relatedOrderId && (
                      <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
                        Linked Order: #{item.relatedOrderId}
                      </span>
                    )}
                    {item.relatedRequestId && (
                      <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
                        Linked Request: #{item.relatedRequestId}
                      </span>
                    )}
                    {item.assignedManager && (
                      <span className="text-slate-600 font-medium">
                        Assigned: {item.assignedManager}
                      </span>
                    )}
                  </div>

                  {/* Resolution Notes if Resolved */}
                  {item.resolutionNotes && (
                    <div className="mt-2.5 p-2.5 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-800">
                      <span className="font-bold block mb-0.5">Manager Resolution:</span>
                      <span>{item.resolutionNotes}</span>
                    </div>
                  )}

                  {/* Toggle Timeline & Evaluator Controls */}
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-50">
                    <button
                      type="button"
                      onClick={() => setExpandedComplaintId(isExpanded ? null : item.complaintId)}
                      className="text-[11px] font-semibold text-[#1D3557] hover:underline flex items-center gap-1"
                    >
                      {isExpanded ? (
                        <>
                          Hide Timeline <ChevronUpIcon />
                        </>
                      ) : (
                        <>
                          View Progression Timeline <ChevronDownIcon />
                        </>
                      )}
                    </button>

                    {/* Evaluator Status Advance Button (Demo Mode Only) */}
                    {getDataMode() === 'demo' && item.status !== 'RESOLVED' && (
                      <Button
                        size="small"
                        type="dashed"
                        loading={advancingId === item.complaintId}
                        onClick={() => handleAdvanceStatus(item.complaintId, item.status)}
                        className="!text-[11px] !h-7 !border-amber-300 !text-amber-800 bg-amber-50/50"
                        icon={<SparklesIcon />}
                      >
                        {item.status === 'SUBMITTED'
                          ? 'Start Investigation'
                          : item.status === 'UNDER_INVESTIGATION'
                            ? 'Escalate to GM'
                            : 'Mark Resolved'}
                      </Button>
                    )}
                  </div>

                  {/* Expandable 4-Stage Progression Timeline */}
                  {isExpanded && item.timeline && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <Text className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                        Resolution Progress
                      </Text>
                      <div className="space-y-3">
                        {item.timeline.map((step, idx) => {
                          const isDone = step.completed;
                          const isCurrent = step.current;

                          return (
                            <div key={idx} className="flex items-start gap-2.5">
                              <div className="mt-0.5">
                                {isDone ? (
                                  <CheckIcon className="w-4 h-4 text-emerald-600" />
                                ) : isCurrent ? (
                                  <ClockIcon className="w-4 h-4 text-amber-500 animate-pulse" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />
                                )}
                              </div>
                              <div className="flex-1 text-xs">
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`font-semibold ${
                                      isCurrent
                                        ? 'text-amber-800'
                                        : isDone
                                          ? 'text-slate-800'
                                          : 'text-slate-400'
                                    }`}
                                  >
                                    {step.label}
                                  </span>
                                  {step.timestamp && (
                                    <span className="text-[11px] text-slate-400">
                                      {step.timestamp}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
