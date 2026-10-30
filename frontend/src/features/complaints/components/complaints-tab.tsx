'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button, Card, Input, Radio, Select, Tag, Typography, message } from 'antd';
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
import {
  COMPLAINT_CATEGORY_OPTIONS,
  COMPLAINT_SEVERITY_OPTIONS,
  createComplaint,
  fetchGuestComplaints,
  generateComplaintIdempotencyKey,
  advanceComplaintStatusDemo,
} from '../../../lib/api/complaints.ts';
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
  const { sessionToken, guest } = useAuth();

  // Form State (matching Figure 39 default values)
  const [category, setCategory] = useState<ComplaintCategory>('FOOD');
  const [severity, setSeverity] = useState<ComplaintSeverity>('HIGH');
  const [reference, setReference] = useState<string>('order-291');
  const [subject, setSubject] = useState<string>('Undercooked chicken in food delivery');
  const [description, setDescription] = useState<string>(
    'The chicken in order #ORD-291 was undercooked and cold on arrival.',
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Complaints History & Realtime State
  const [complaints, setComplaints] = useState<ComplaintResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedComplaintId, setExpandedComplaintId] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  // Single client-generated idempotency key retained across retry attempts
  const idempotencyKeyRef = useRef<string>(generateComplaintIdempotencyKey());

  // Source options matching Figure 39
  const sourceOptions: SourceReferenceOption[] = [
    {
      id: 'order-291',
      type: 'order',
      referenceId: 'order-291',
      label: 'Order #ORD-291 — Lunch, LKR 1,500',
    },
    {
      id: 'req-041',
      type: 'request',
      referenceId: 'req-041',
      label: 'Request #REQ-041 — Extra Towels',
    },
    {
      id: 'none',
      type: 'none',
      label: 'No reference',
    },
  ];

  const loadComplaints = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setFetchError(null);

      try {
        const data = await fetchGuestComplaints(sessionToken || 'demo-token');
        setComplaints(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to retrieve complaints.';
        setFetchError(msg);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [sessionToken],
  );

  // Asynchronous initial fetch without synchronous setState in effect body (React 19 compliant)
  useEffect(() => {
    let isCancelled = false;

    fetchGuestComplaints(sessionToken || 'demo-token')
      .then((data) => {
        if (!isCancelled) {
          setComplaints(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : 'Unable to retrieve complaints.';
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
  }, [sessionToken, guest, loadComplaints]);

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

    const trimmedSubject = subject.trim() || `${category} complaint`;
    if (trimmedSubject.length < 3 || trimmedSubject.length > 150) {
      setSubmitError('Subject must be between 3 and 150 characters.');
      message.error('Subject must be between 3 and 150 characters.');
      return;
    }

    setSubmitting(true);

    const selectedRef = sourceOptions.find((o) => o.id === reference);
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

    try {
      const result = await createComplaint(
        payload,
        sessionToken || 'demo-token',
        idempotencyKeyRef.current,
      );

      // Successfully submitted - update complaint list
      setComplaints((prev) => [
        result,
        ...prev.filter((c) => c.complaintId !== result.complaintId),
      ]);
      setExpandedComplaintId(result.complaintId);

      // Reset form and regenerate idempotency key for subsequent complaint
      setDescription('');
      setSubject('');
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

  // Demo Status Advancement Stepper for Evaluators
  const handleAdvanceStatus = async (complaintId: string, currentStatus: ComplaintStatus) => {
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
        sessionToken || 'demo-token',
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

  return (
    <div
      role="tabpanel"
      id="tabpanel-complaints"
      aria-labelledby="nav-tab-complaints"
      className="w-full space-y-4 pb-24"
    >
      {/* Figure 39 Header Info */}
      <div className="flex items-center justify-between px-1">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Guest Complaints
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">Direct to Management</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              Room {guest?.roomNumber || '103'} — Auto-attached
            </span>
          </div>
        </div>
      </div>

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
              setCategory(val as ComplaintCategory);
              // Auto-adjust default subject if empty
              if (
                !subject ||
                subject.startsWith('Food') ||
                subject.startsWith('Staff') ||
                subject.startsWith('Room') ||
                subject.startsWith('Noise')
              ) {
                const opt = COMPLAINT_CATEGORY_OPTIONS.find((c) => c.value === val);
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
        <div className="mb-4">
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            LINK TO ORDER OR REQUEST (OPTIONAL)
          </Text>
          <Radio.Group
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full flex flex-col gap-2"
          >
            {sourceOptions.map((opt) => (
              <Radio
                key={opt.id}
                value={opt.id}
                className="!border !border-slate-200 !rounded-xl !p-2.5 !m-0 hover:!border-slate-300 text-xs"
              >
                {opt.label}
              </Radio>
            ))}
          </Radio.Group>
        </div>

        {/* 4. Subject Summary Field */}
        <div className="mb-3">
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            SUBJECT / ISSUE SUMMARY
          </Text>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            placeholder="e.g. Undercooked chicken in food delivery"
            className="!rounded-xl text-xs !bg-slate-50 !border-slate-200 !h-10"
          />
        </div>

        {/* 5. Description Textarea */}
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

        {/* 6. Submit Complaint Action Button */}
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
            icon={<RefreshIcon className={loading ? 'animate-spin' : ''} />}
            onClick={() => loadComplaints(true)}
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
            onRetry={() => loadComplaints(true)}
          />
        ) : complaints.length === 0 ? (
          <EmptyState
            title="No complaints filed"
            description="You have not filed any complaints during this stay. Direct issues will appear here with live resolution status."
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

                    {/* Evaluator Status Advance Button (Demo Mode) */}
                    {item.status !== 'RESOLVED' && (
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
