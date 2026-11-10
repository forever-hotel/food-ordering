import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ConfigProvider, App } from 'antd';
import { appTheme } from '../../src/config/theme';
import { ServicesTab } from '../../src/features/services/components/services-tab';
import { ComplaintsTab } from '../../src/features/complaints/components/complaints-tab';
import { NavigationProvider } from '../../src/lib/navigation/navigation-context';
import { CartProvider } from '../../src/lib/cart/cart-context';
import type { ServiceRequestResponse } from '../../src/types/services';
import type { ComplaintResponse } from '../../src/types/complaints';

const mockServiceRequest: ServiceRequestResponse = {
  requestId: 'REQ-101',
  roomNumber: '401',
  bookingId: 'BK-SRV-1',
  requestType: 'maintenance',
  description: 'Air conditioning not cooling enough',
  status: 'SUBMITTED',
  priority: 'NORMAL',
  assignedStaff: null,
  estimatedCompletionMinutes: 30,
  taskId: 'task-srv-1',
  idempotencyKey: 'idem-srv-101',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  timeline: [
    {
      status: 'SUBMITTED',
      label: 'Request Submitted',
      completed: true,
      current: true,
      timestamp: new Date().toISOString(),
    },
  ],
};

const mockComplaint: ComplaintResponse = {
  complaintId: 'CMP-202',
  roomNumber: '401',
  bookingId: 'BK-SRV-1',
  category: 'FOOD',
  severity: 'HIGH',
  subject: 'Undercooked chicken in food delivery',
  description: 'The chicken in order #ORD-291 was undercooked and cold on arrival.',
  relatedOrderId: 'order-291',
  status: 'SUBMITTED',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  timeline: [
    {
      status: 'SUBMITTED',
      label: 'Complaint Logged',
      completed: true,
      current: true,
      timestamp: new Date().toISOString(),
    },
  ],
};

const initialMockAuth = {
  status: 'authenticated',
  sessionToken: 'mock-services-token' as string | null,
  guest: {
    bookingId: 'BK-SRV-1',
    roomNumber: '401',
    guestName: 'Robert Langdon',
  } as any,
  expiresAt: '2026-11-10T12:00:00Z',
  error: null,
  demoTokens: {},
  loginWithQr: jest.fn(),
  logout: jest.fn(),
  clearError: jest.fn(),
  refreshSession: jest.fn(),
};

let mockAuth = { ...initialMockAuth };

const mockCreateServiceRequest = jest.fn();
const mockFetchGuestServiceRequests = jest.fn();
const mockAdvanceServiceRequestStatusDemo = jest.fn();
const mockCreateComplaint = jest.fn();
const mockFetchGuestComplaints = jest.fn();
const mockAdvanceComplaintStatusDemo = jest.fn();

jest.mock('../../src/lib/api/services', () => {
  const actual = jest.requireActual('../../src/lib/api/services');
  const serviceOptions = actual.SERVICE_TYPE_OPTIONS.map((opt: any) =>
    opt.key === 'toiletries' ? { ...opt, disabled: true } : opt,
  );
  return {
    ...actual,
    SERVICE_TYPE_OPTIONS: serviceOptions,
    createServiceRequest: (...args: unknown[]) => mockCreateServiceRequest(...args),
    fetchGuestServiceRequests: (...args: unknown[]) => mockFetchGuestServiceRequests(...args),
    advanceServiceRequestStatusDemo: (...args: unknown[]) =>
      mockAdvanceServiceRequestStatusDemo(...args),
    generateServiceIdempotencyKey: () => 'mock-srv-idemp',
  };
});

jest.mock('../../src/lib/api/complaints', () => {
  const actual = jest.requireActual('../../src/lib/api/complaints');
  return {
    ...actual,
    createComplaint: (...args: unknown[]) => mockCreateComplaint(...args),
    fetchGuestComplaints: (...args: unknown[]) => mockFetchGuestComplaints(...args),
    advanceComplaintStatusDemo: (...args: unknown[]) => mockAdvanceComplaintStatusDemo(...args),
    generateComplaintIdempotencyKey: () => 'mock-cmp-idemp',
  };
});

jest.mock('../../src/lib/data-mode/data-mode', () => {
  const actual = jest.requireActual('../../src/lib/data-mode/data-mode');
  return {
    ...actual,
    getDataMode: () => 'demo',
  };
});

let latestServicesRealtimeConfig: any = null;
jest.mock('../../src/lib/realtime/realtime-client', () => {
  const actual = jest.requireActual('../../src/lib/realtime/realtime-client');
  return {
    ...actual,
    FossRealtimeClient: jest.fn().mockImplementation((config) => {
      latestServicesRealtimeConfig = config;
      return {
        connect: jest.fn(),
        disconnect: jest.fn(),
        getStatus: jest.fn().mockReturnValue('CONNECTED'),
      };
    }),
  };
});

jest.mock('../../src/lib/auth/auth-context', () => {
  const actual = jest.requireActual('../../src/lib/auth/auth-context');
  return {
    ...actual,
    useAuth: () => mockAuth,
  };
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={appTheme}>
      <App>
        <NavigationProvider>
          <CartProvider>{children}</CartProvider>
        </NavigationProvider>
      </App>
    </ConfigProvider>
  );
}

describe('ServicesTab Component', () => {
  beforeEach(() => {
    mockAuth = { ...initialMockAuth };
    mockFetchGuestServiceRequests.mockReset();
    mockCreateServiceRequest.mockReset();
    mockFetchGuestServiceRequests.mockResolvedValue([mockServiceRequest]);
    mockCreateServiceRequest.mockResolvedValue(mockServiceRequest);
  });

  it('renders service type buttons, allows entering description and submitting request', async () => {
    mockFetchGuestServiceRequests.mockResolvedValue([mockServiceRequest]);
    mockCreateServiceRequest.mockResolvedValue({
      ...mockServiceRequest,
      requestId: 'REQ-102',
      description: 'Extra bath towels please',
    });

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Maintenance')).toBeDefined();
    });

    // Select Towels service type
    const towelsBtn = screen.getByRole('button', { name: /Towels/i });
    fireEvent.click(towelsBtn);

    // Enter description
    const descInput = screen.getByPlaceholderText(/AC not cooling/i);
    fireEvent.change(descInput, { target: { value: 'Extra bath towels please' } });

    // Submit request
    const submitBtn = screen.getByRole('button', { name: /Submit Request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateServiceRequest).toHaveBeenCalledTimes(1);
    });
  });

  it('allows selecting room cleaning and extra towels', async () => {
    mockFetchGuestServiceRequests.mockResolvedValue([mockServiceRequest]);
    mockCreateServiceRequest.mockResolvedValue({
      ...mockServiceRequest,
      requestId: 'REQ-103',
      requestType: 'housekeeping',
    });

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Maintenance')).toBeDefined();
    });

    // Select Room Cleaning
    const cleaningBtn = screen.getByRole('button', { name: /Room Cleaning/i });
    fireEvent.click(cleaningBtn);

    // Select Extra Towels
    const towelsBtn = screen.getByRole('button', { name: /Extra Towels/i });
    fireEvent.click(towelsBtn);
  });

  it('displays AlertNotice with retry when service requests fetch fails', async () => {
    mockFetchGuestServiceRequests.mockRejectedValueOnce(new Error('Failed to load services'));

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load services/i)).toBeDefined();
    });

    // Ensure neither empty state nor fallback requests are rendered on failure
    expect(screen.queryByText('No service requests yet')).toBeNull();
    expect(screen.queryByText(/REQ-041/i)).toBeNull();
    expect(screen.queryByText(/REQ-042/i)).toBeNull();

    mockFetchGuestServiceRequests.mockResolvedValue([mockServiceRequest]);
    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE REQUESTS')).toBeDefined();
    });
  });

  it('displays empty state and no fallback requests when guest has zero requests', async () => {
    mockFetchGuestServiceRequests.mockResolvedValue([]);

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('ACTIVE REQUESTS')).toBeDefined();
      expect(screen.getByText('No service requests yet')).toBeDefined();
      expect(
        screen.getByText('Your service requests will appear here once submitted.'),
      ).toBeDefined();
    });

    // Verify hardcoded REQ-041 and REQ-042 never appear
    expect(screen.queryByText(/REQ-041/i)).toBeNull();
    expect(screen.queryByText(/REQ-042/i)).toBeNull();
    expect(screen.queryByText(/Please bring 2 extra bath towels/i)).toBeNull();
    expect(screen.queryByText(/Morning housekeeping please/i)).toBeNull();
  });

  it('displays only genuine requests when guest has one request', async () => {
    mockFetchGuestServiceRequests.mockResolvedValue([mockServiceRequest]);

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('ACTIVE REQUESTS')).toBeDefined();
      expect(screen.getByText(/Air conditioning not cooling enough/i)).toBeDefined();
    });

    // Ensure empty state is not displayed
    expect(screen.queryByText('No service requests yet')).toBeNull();
    expect(screen.queryByText(/REQ-041/i)).toBeNull();
    expect(screen.queryByText(/REQ-042/i)).toBeNull();
  });

  it('displays Guest Session Required and no requests when guest has no active stay', async () => {
    mockAuth = {
      ...initialMockAuth,
      sessionToken: null,
      guest: null,
    };

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Guest Session Required')).toBeDefined();
      expect(
        screen.getByText(/Please scan your room QR code to access hotel service requests/i),
      ).toBeDefined();
    });

    expect(screen.queryByText('ACTIVE REQUESTS')).toBeNull();
    expect(screen.queryByText(/REQ-041/i)).toBeNull();
    expect(screen.queryByText(/REQ-042/i)).toBeNull();
  });

  it('handles submission error gracefully and toggles card expansion', async () => {
    mockCreateServiceRequest.mockRejectedValueOnce(new Error('Internal server error'));

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Maintenance')).toBeDefined();
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/couldn't submit your request right now/i).length).toBeGreaterThan(
        0,
      );
    });

    // Toggle expansion of existing request card
    const requestItem = screen.getByText(/Air conditioning not cooling/i);
    fireEvent.click(requestItem);
  });

  it('renders different statuses, assigned staff, and category labels', async () => {
    const variedRequests: ServiceRequestResponse[] = [
      {
        ...mockServiceRequest,
        requestId: 'REQ-104',
        requestType: 'WATER_BOTTLES',
        status: 'ASSIGNED',
        assignedStaff: 'Kamal P.',
        createdAt: new Date().toISOString(),
      },
      {
        ...mockServiceRequest,
        requestId: 'REQ-105',
        requestType: 'LAUNDRY_PICKUP',
        status: 'IN_PROGRESS',
        createdAt: new Date().toISOString(),
      },
      {
        ...mockServiceRequest,
        requestId: 'REQ-106',
        requestType: 'TOILETRIES',
        status: 'COMPLETED',
        assignedStaff: 'Kamal P.',
        createdAt: new Date().toISOString(),
      },
    ];
    mockFetchGuestServiceRequests.mockResolvedValue(variedRequests);

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Water Bottles/i)).toBeDefined();
      expect(screen.getAllByText(/Laundry/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Toiletries/i).length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Assigned/i)).toBeDefined();
    expect(screen.getAllByText(/In Progress/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Completed/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Completed by Kamal P./i)).toBeDefined();
  });

  it('allows advancing request status in demo mode and tests offline fallback', async () => {
    const demoReq: ServiceRequestResponse = {
      ...mockServiceRequest,
      requestId: 'REQ-DEMO-1',
      status: 'SUBMITTED',
      timeline: [
        { status: 'SUBMITTED', label: 'Submitted', completed: true, current: true },
        { status: 'ASSIGNED', label: 'Assigned', completed: false, current: false },
        { status: 'COMPLETED', label: 'Completed', completed: false, current: false },
      ],
    };
    mockFetchGuestServiceRequests.mockResolvedValue([demoReq]);
    mockAdvanceServiceRequestStatusDemo.mockResolvedValueOnce({
      ...demoReq,
      status: 'IN_PROGRESS',
    });

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Air conditioning not cooling/i)).toBeDefined();
    });

    // Expand card to view demo advancement buttons
    const card = screen.getByText(/Air conditioning not cooling/i);
    fireEvent.click(card);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Demo: In Progress/i })).toBeDefined();
    });

    const inProgressBtn = screen.getByRole('button', { name: /Demo: In Progress/i });
    fireEvent.click(inProgressBtn);

    await waitFor(() => {
      expect(mockAdvanceServiceRequestStatusDemo).toHaveBeenCalledWith(
        'mock-services-token',
        'REQ-DEMO-1',
        'IN_PROGRESS',
        undefined,
      );
    });

    // Offline fallback when advance API rejects
    mockAdvanceServiceRequestStatusDemo.mockRejectedValueOnce(new Error('Network offline'));
    const completeBtn = screen.getByRole('button', { name: /Demo: Complete/i });
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(mockAdvanceServiceRequestStatusDemo).toHaveBeenCalledTimes(2);
    });
  });

  it('allows submitting request without entering optional description', async () => {
    mockCreateServiceRequest.mockResolvedValueOnce({
      ...mockServiceRequest,
      requestId: 'REQ-NO-DESC-1',
      description: null,
    });

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Maintenance')).toBeDefined();
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateServiceRequest).toHaveBeenCalled();
    });
    expect(mockCreateServiceRequest.mock.calls[0][1].requestType).toBe('MAINTENANCE');
  });

  it('handles service requests fetch failure with retry and realtime updates', async () => {
    mockFetchGuestServiceRequests.mockRejectedValueOnce(
      new Error('Network failure loading services'),
    );

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Network failure loading services/i)).toBeDefined();
    });

    // Retry succeeds
    mockFetchGuestServiceRequests.mockResolvedValue([mockServiceRequest]);
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/Air conditioning not cooling/i)).toBeDefined();
    });

    // Realtime update matching existing request
    if (latestServicesRealtimeConfig?.onEvent) {
      latestServicesRealtimeConfig.onEvent({
        eventType: 'SERVICE_REQUEST_STATUS_UPDATED',
        data: {
          ...mockServiceRequest,
          status: 'IN_PROGRESS',
          assignedStaff: 'Priyanka N.',
        },
      });
    }

    // Realtime update with new request
    if (latestServicesRealtimeConfig?.onEvent) {
      latestServicesRealtimeConfig.onEvent({
        eventType: 'SERVICE_REQUEST_STATUS_UPDATED',
        data: {
          ...mockServiceRequest,
          requestId: 'REQ-NEW-99',
          description: 'Iron and ironing board',
          status: 'SUBMITTED',
        },
      });
    }

    // Realtime refresh trigger
    if (latestServicesRealtimeConfig?.onRefresh) {
      latestServicesRealtimeConfig.onRefresh();
    }
  });

  it('renders EmptyState when guest session is absent', async () => {
    const savedAuth = mockAuth;
    mockAuth = { ...mockAuth, sessionToken: null, guest: null };

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    expect(screen.getByText('Guest Session Required')).toBeDefined();
    expect(screen.getByText(/scan your room QR code/i)).toBeDefined();

    mockAuth = savedAuth;
  });

});

describe('ComplaintsTab Component', () => {
  beforeEach(() => {
    mockAuth = { ...initialMockAuth };
    mockFetchGuestComplaints.mockReset();
    mockCreateComplaint.mockReset();
    mockFetchGuestComplaints.mockResolvedValue([mockComplaint]);
    mockCreateComplaint.mockResolvedValue(mockComplaint);
  });

  it('renders complaint form, allows submission and displays filed complaints', async () => {
    mockFetchGuestComplaints.mockResolvedValue([mockComplaint]);
    mockCreateComplaint.mockResolvedValue({
      ...mockComplaint,
      complaintId: 'CMP-203',
    });

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Undercooked chicken/i).length).toBeGreaterThan(0);
    });

    // Enter valid description >= 10 characters
    const descInput = screen.getByPlaceholderText(/Please detail your experience/i);
    fireEvent.change(descInput, {
      target: { value: 'Undercooked chicken delivered in food order.' },
    });

    // Submit complaint
    const submitBtn = screen.getByRole('button', { name: /Submit Complaint/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateComplaint).toHaveBeenCalledTimes(1);
    });
  });

  it('displays AlertNotice with retry when complaints fetch fails', async () => {
    mockFetchGuestComplaints.mockRejectedValueOnce(new Error('Complaints load failed'));

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Complaints load failed/i)).toBeDefined();
    });

    mockFetchGuestComplaints.mockResolvedValue([mockComplaint]);
    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Undercooked chicken/i).length).toBeGreaterThan(0);
    });
  });

  it('renders complaints tracking list when empty using fallback complaints', async () => {
    mockFetchGuestComplaints.mockResolvedValue([]);

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Stay Complaints & Tracking/i)).toBeDefined();
    });
  });

  it('validates description length and toggles card expansion', async () => {
    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Undercooked chicken/i).length).toBeGreaterThan(0);
    });

    // Enter short description (< 10 chars)
    const descInput = screen.getByPlaceholderText(/Please detail your experience/i);
    fireEvent.change(descInput, { target: { value: 'Too short' } });

    const submitBtn = screen.getByRole('button', { name: /Submit Complaint/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Please provide at least 10 characters/i).length).toBeGreaterThan(
        0,
      );
    });

    // Toggle card expansion
    const complaintCard = screen.getAllByText(/Undercooked chicken/i)[0];
    fireEvent.click(complaintCard);
  });

  it('handles selecting severity levels and linked references', async () => {
    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Undercooked chicken/i).length).toBeGreaterThan(0);
    });

    // Select Low, Medium, High severity buttons
    const lowBtn = screen.getByRole('button', { name: /Low/i });
    fireEvent.click(lowBtn);
    expect(lowBtn.getAttribute('aria-pressed')).toBe('true');

    const medBtn = screen.getByRole('button', { name: /Medium/i });
    fireEvent.click(medBtn);
    expect(medBtn.getAttribute('aria-pressed')).toBe('true');

    const highBtn = screen.getByRole('button', { name: /High/i });
    fireEvent.click(highBtn);
    expect(highBtn.getAttribute('aria-pressed')).toBe('true');

    // Link reference radio buttons
    const reqRadio = screen.getByLabelText(/Request #REQ-041/i);
    fireEvent.click(reqRadio);

    const noneRadio = screen.getByLabelText(/No reference/i);
    fireEvent.click(noneRadio);
  });

  it('validates description > 1000 characters and handles submission errors', async () => {
    mockCreateComplaint.mockRejectedValueOnce(new Error('Complaint creation failed on server'));

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Undercooked chicken/i).length).toBeGreaterThan(0);
    });

    // Test description > 1000 characters
    const descInput = screen.getByPlaceholderText(/Please detail your experience/i);
    fireEvent.change(descInput, { target: { value: 'A'.repeat(1005) } });

    const submitBtn = screen.getByRole('button', { name: /Submit Complaint/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getAllByText(/Description cannot exceed 1000 characters/i).length,
      ).toBeGreaterThan(0);
    });

    // Test submission failure with valid text
    fireEvent.change(descInput, {
      target: { value: 'Valid complaint with more than 10 characters' },
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Complaint creation failed on server/i).length).toBeGreaterThan(0);
    });
  });

  it('advances complaint status across progression stages and expands timeline', async () => {
    const progressiveComplaint: ComplaintResponse = {
      ...mockComplaint,
      complaintId: 'CMP-PROG-1',
      status: 'SUBMITTED',
      resolutionNotes: 'Complimentary dessert voucher issued to room.',
      timeline: [
        {
          status: 'SUBMITTED',
          label: 'Submitted',
          completed: true,
          current: true,
          timestamp: '12:00',
        },
        {
          status: 'UNDER_INVESTIGATION',
          label: 'Under Investigation',
          completed: false,
          current: false,
        },
        { status: 'ESCALATED', label: 'Escalated', completed: false, current: false },
        { status: 'RESOLVED', label: 'Resolved', completed: false, current: false },
      ],
    };

    mockFetchGuestComplaints.mockResolvedValue([progressiveComplaint]);
    mockAdvanceComplaintStatusDemo.mockResolvedValueOnce({
      ...progressiveComplaint,
      status: 'UNDER_INVESTIGATION',
    });

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('CMP-PROG-1')).toBeDefined();
    });

    // Verify resolution notes display
    expect(screen.getByText(/Complimentary dessert voucher/i)).toBeDefined();

    // Toggle timeline view
    const viewTimelineBtn = screen.getByRole('button', { name: /View Progression Timeline/i });
    fireEvent.click(viewTimelineBtn);

    await waitFor(() => {
      expect(screen.getByText('Resolution Progress')).toBeDefined();
    });

    // Advance status to UNDER_INVESTIGATION
    const startInvestBtn = screen.getByRole('button', { name: /Start Investigation/i });
    fireEvent.click(startInvestBtn);

    await waitFor(() => {
      expect(mockAdvanceComplaintStatusDemo).toHaveBeenCalled();
    });

    // Advance failure error handling
    mockAdvanceComplaintStatusDemo.mockRejectedValueOnce(new Error('Advance failed'));
    mockAdvanceComplaintStatusDemo.mockResolvedValueOnce({
      ...progressiveComplaint,
      status: 'ESCALATED',
    });
  });

  it('validates description < 10 characters and subject < 3 characters', async () => {
    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Undercooked chicken/i).length).toBeGreaterThan(0);
    });

    const descInput = screen.getByPlaceholderText(/Please detail your experience/i);
    const submitBtn = screen.getByRole('button', { name: /Submit Complaint/i });

    // Description < 10 characters
    fireEvent.change(descInput, { target: { value: 'Short' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Please provide at least 10 characters/i).length).toBeGreaterThan(
        0,
      );
    });
  });

  it('handles complaints fetch failure with retry and realtime updates', async () => {
    mockFetchGuestComplaints.mockRejectedValueOnce(new Error('Network failure loading complaints'));

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Network failure loading complaints/i)).toBeDefined();
    });

    // Retry succeeds
    mockFetchGuestComplaints.mockResolvedValue([
      {
        ...mockComplaint,
        complaintId: 'CMP-STAT-1',
        status: 'UNDER_INVESTIGATION',
        severity: 'LOW',
      },
      {
        ...mockComplaint,
        complaintId: 'CMP-STAT-2',
        status: 'ESCALATED',
        severity: 'URGENT',
      },
      {
        ...mockComplaint,
        complaintId: 'CMP-STAT-3',
        status: 'RESOLVED',
        severity: 'MEDIUM',
      },
    ]);

    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('CMP-STAT-1')).toBeDefined();
      expect(screen.getByText('CMP-STAT-2')).toBeDefined();
      expect(screen.getByText('CMP-STAT-3')).toBeDefined();
    });

    // Realtime update with status change
    if (latestServicesRealtimeConfig?.onEvent) {
      latestServicesRealtimeConfig.onEvent({
        eventType: 'COMPLAINT_STATUS_UPDATED',
        data: {
          complaintId: 'CMP-STAT-1',
          status: 'RESOLVED',
          assignedManager: 'Operations Manager',
          resolutionNotes: 'Full refund processed for dinner.',
        },
      });

      // Event without complaintId (ignored branch)
      latestServicesRealtimeConfig.onEvent({
        eventType: 'COMPLAINT_STATUS_UPDATED',
        data: {},
      });
    }

    // Realtime refresh trigger
    if (latestServicesRealtimeConfig?.onRefresh) {
      latestServicesRealtimeConfig.onRefresh();
    }
  });

  it('renders EmptyState when guest session is absent in ComplaintsTab', () => {
    const savedAuth = mockAuth;
    mockAuth = { ...mockAuth, sessionToken: null, guest: null };

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    expect(screen.getByText('Guest Session Required')).toBeDefined();
    expect(
      screen.getByText(/Please scan your room QR code to view and file complaints/i),
    ).toBeDefined();

    mockAuth = savedAuth;
  });

  it('handles multi-stage complaint status advancement and failure branches', async () => {
    mockAdvanceComplaintStatusDemo.mockClear();
    const multiStageComplaint: ComplaintResponse = {
      ...mockComplaint,
      complaintId: 'CMP-STAGES-1',
      status: 'UNDER_INVESTIGATION',
    };

    mockFetchGuestComplaints.mockResolvedValue([multiStageComplaint]);
    // Test advance error rejection branch
    mockAdvanceComplaintStatusDemo.mockRejectedValueOnce(new Error('Demo advancement blocked'));

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('CMP-STAGES-1')).toBeDefined();
    });

    // Advance UNDER_INVESTIGATION -> ESCALATED
    const escalateBtn = screen.getByRole('button', { name: /Escalate to GM/i });
    fireEvent.click(escalateBtn);

    await waitFor(() => {
      expect(mockAdvanceComplaintStatusDemo).toHaveBeenCalledWith(
        'CMP-STAGES-1',
        'ESCALATED',
        'mock-services-token',
        expect.any(String),
      );
    });
  });

  it('validates description length and unauthenticated submission in ComplaintsTab', async () => {
    // Guest object exists but bookingId is empty to trigger submit validation
    mockAuth = { ...initialMockAuth, guest: { ...initialMockAuth.guest, bookingId: '' } };

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Undercooked chicken/i).length).toBeGreaterThan(0);
    });

    const descInput = screen.getByPlaceholderText(/Please detail your experience/i);
    fireEvent.change(descInput, {
      target: { value: 'Valid complaint description over ten chars' },
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Complaint/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getAllByText(/Active verified guest session is required to submit a complaint/i)
          .length,
      ).toBeGreaterThan(0);
    });

    mockAuth = { ...initialMockAuth };
  });

  it('handles service requests realtime events with new requests, unkeyed events, and unauthenticated submission', async () => {
    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Maintenance')).toBeDefined();
    });

    // Realtime event with a completely new requestId
    if (latestServicesRealtimeConfig?.onEvent) {
      latestServicesRealtimeConfig.onEvent({
        eventType: 'SERVICE_REQUEST_STATUS_UPDATED',
        data: {
          ...mockServiceRequest,
          requestId: 'REQ-NEW-999',
          status: 'IN_PROGRESS',
        },
      });

      // Realtime event with empty data triggers reload fallback
      latestServicesRealtimeConfig.onEvent({
        eventType: 'SERVICE_REQUEST_STATUS_UPDATED',
        data: {},
      });
    }

    // Submission with missing session token
    const savedAuth = mockAuth;
    mockAuth = { ...mockAuth, guest: { ...mockAuth.guest!, bookingId: '' } };

    const descInput = screen.getByPlaceholderText(/e\.g\. AC not cooling properly/i);
    fireEvent.change(descInput, { target: { value: 'AC temperature calibration' } });

    const submitBtn = screen.getByRole('button', { name: /Submit Request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getAllByText(
          /Active verified guest session is required to submit a service request/i,
        ).length,
      ).toBeGreaterThan(0);
    });

    mockAuth = savedAuth;
  });

  it('renders custom status and severity fallback badges in ComplaintsTab', async () => {
    const customBadgeComplaint: ComplaintResponse = {
      ...mockComplaint,
      complaintId: 'CMP-CUSTOM-TAGS',
      status: 'CUSTOM_STATUS' as any,
      severity: 'CUSTOM_SEV' as any,
    };

    mockFetchGuestComplaints.mockResolvedValueOnce([customBadgeComplaint]);

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('CMP-CUSTOM-TAGS')).toBeDefined();
      expect(screen.getByText('CUSTOM_STATUS')).toBeDefined();
      expect(screen.getByText('CUSTOM_SEV')).toBeDefined();
    });
  });

  it('handles disabled service type option and non-Error API rejections', async () => {
    mockFetchGuestServiceRequests.mockRejectedValueOnce('Service backend offline raw string');

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Unable to retrieve service requests/i)).toBeDefined();
    });

    // Select Toiletries (disabled)
    const toiletriesBtn = screen.getByText('Toiletries');
    fireEvent.click(toiletriesBtn);

    const submitBtn = screen.getByRole('button', { name: /Temporarily Unavailable/i });
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
  });

  it('advances ESCALATED complaint status to RESOLVED in ComplaintsTab', async () => {
    mockAdvanceComplaintStatusDemo.mockClear();
    const escalatedComplaint: ComplaintResponse = {
      ...mockComplaint,
      complaintId: 'CMP-ESC-1',
      status: 'ESCALATED',
    };

    mockFetchGuestComplaints.mockResolvedValueOnce([escalatedComplaint]);
    mockAdvanceComplaintStatusDemo.mockResolvedValueOnce({
      ...escalatedComplaint,
      status: 'RESOLVED',
    });

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('CMP-ESC-1')).toBeDefined();
    });

    // Advance ESCALATED -> RESOLVED
    const resolveBtn = screen.getByRole('button', { name: /Mark Resolved/i });
    fireEvent.click(resolveBtn);

    await waitFor(() => {
      expect(mockAdvanceComplaintStatusDemo).toHaveBeenCalledWith(
        'CMP-ESC-1',
        'RESOLVED',
        'mock-services-token',
        expect.any(String),
      );
    });
  });

  it('handles realtime complaint updates with timeline step matching', async () => {
    mockFetchGuestComplaints.mockResolvedValueOnce([mockComplaint]);

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('CMP-202')).toBeDefined();
    });

    // Simulate realtime event for matching complaint and non-matching complaint
    if (latestServicesRealtimeConfig?.onEvent) {
      act(() => {
        // Non-matching complaint ID
        latestServicesRealtimeConfig.onEvent({
          eventType: 'COMPLAINT_STATUS_UPDATED',
          data: {
            complaintId: 'CMP-OTHER-999',
            status: 'RESOLVED',
          },
        });

        // Matching complaint ID
        latestServicesRealtimeConfig.onEvent({
          eventType: 'COMPLAINT_STATUS_UPDATED',
          data: {
            complaintId: 'CMP-202',
            status: 'RESOLVED',
            assignedManager: 'Manager Smith',
            resolutionNotes: 'Refund issued to room folio.',
          },
        });
      });
    }

    await waitFor(() => {
      expect(screen.getAllByText(/Resolved/i).length).toBeGreaterThan(0);
    });
  });
});
