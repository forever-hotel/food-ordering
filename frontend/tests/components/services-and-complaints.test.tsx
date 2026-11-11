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
const mockFetchGuestOrders = jest.fn();

jest.mock('../../src/lib/api/orders', () => {
  const actual = jest.requireActual('../../src/lib/api/orders');
  return {
    ...actual,
    fetchGuestOrders: (...args: unknown[]) => mockFetchGuestOrders(...args),
  };
});

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

let mockDataMode: 'demo' | 'api' = 'demo';
jest.mock('../../src/lib/data-mode/data-mode', () => {
  const actual = jest.requireActual('../../src/lib/data-mode/data-mode');
  return {
    ...actual,
    getDataMode: () => mockDataMode,
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

  it('renders task progression timeline milestones and handles missing timestamps with Time unavailable', async () => {
    const progressionReq: ServiceRequestResponse = {
      ...mockServiceRequest,
      requestId: 'REQ-PROG-1',
      status: 'IN_PROGRESS',
      timeline: [
        {
          status: 'SUBMITTED',
          label: 'Request Submitted',
          completed: true,
          current: false,
          timestamp: '2026-11-10T08:00:00.000Z',
        },
        {
          status: 'ASSIGNED',
          label: 'Worker Assigned',
          completed: true,
          current: false,
          // Missing timestamp: should render "Time unavailable"
        },
        {
          status: 'IN_PROGRESS',
          label: 'Service In Progress',
          completed: true,
          current: true,
          timestamp: '2026-11-10T08:15:00.000Z',
        },
        {
          status: 'COMPLETED',
          label: 'Service Completed',
          completed: false,
          current: false,
        },
      ],
    };

    mockFetchGuestServiceRequests.mockResolvedValue([progressionReq]);

    render(
      <Wrapper>
        <ServicesTab />
      </Wrapper>,
    );

    // Wait for real request card to appear
    await waitFor(() => {
      expect(screen.getByText(/Air conditioning not cooling/i)).toBeDefined();
    });

    // Click request card to expand the Task Progression section
    const card = screen.getByText(/Air conditioning not cooling/i);
    fireEvent.click(card);

    await waitFor(() => {
      expect(screen.getByText(/TASK PROGRESSION/i)).toBeDefined();
      expect(screen.getByText('Request Submitted')).toBeDefined();
      expect(screen.getByText('Worker Assigned')).toBeDefined();
      expect(screen.getByText('Time unavailable')).toBeDefined();
      expect(screen.getByText('Service In Progress')).toBeDefined();
      expect(screen.getByText('Service Completed')).toBeDefined();
    });
  });
});

describe('ComplaintsTab Component', () => {
  beforeEach(() => {
    mockAuth = { ...initialMockAuth };
    mockFetchGuestComplaints.mockReset();
    mockCreateComplaint.mockReset();
    mockDataMode = 'demo';
    mockFetchGuestOrders.mockReset();
    mockFetchGuestServiceRequests.mockReset();
    mockFetchGuestOrders.mockResolvedValue([]);
    mockFetchGuestServiceRequests.mockResolvedValue([]);
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

  it('renders complaints tracking empty state when guest has no submitted complaints', async () => {
    mockFetchGuestComplaints.mockResolvedValue([]);

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Stay Complaints & Tracking/i)).toBeDefined();
      expect(screen.getByText(/No complaints submitted yet/i)).toBeDefined();
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
    mockFetchGuestOrders.mockResolvedValue([
      {
        orderId: 'ORD-291',
        bookingId: 'BK-SRV-1',
        roomNumber: '401',
        status: 'DELIVERED',
        totalAmount: 1500,
        items: [{ itemId: 'item-1', name: 'Lunch', unitPrice: 1500, quantity: 1 }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [],
      },
    ]);
    mockFetchGuestServiceRequests.mockResolvedValue([
      {
        requestId: 'REQ-041',
        bookingId: 'BK-SRV-1',
        roomNumber: '401',
        requestType: 'EXTRA_TOWELS',
        description: 'Extra towels',
        status: 'SUBMITTED',
        priority: 'NORMAL',
        assignedStaff: null,
        estimatedCompletionMinutes: 15,
        taskId: 'task-1',
        idempotencyKey: 'idemp-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [],
      },
    ]);

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    const refDropdown = screen.getByRole('combobox', {
      name: /Link to order or request/i,
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Undercooked chicken/i).length).toBeGreaterThan(0);
      // Collapsed by default with "No reference" selected
      expect(refDropdown.getAttribute('aria-expanded')).not.toBe('true');
      expect(screen.getByText('No reference')).toBeDefined();
    });

    // Radio inputs must no longer be rendered for references
    expect(screen.queryByRole('radio', { name: /No reference/i })).toBeNull();
    // Options stay collapsed until opened
    expect(screen.queryByText(/Request #REQ-041/i)).toBeNull();

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

    // Open dropdown and verify available order, service request, and No reference options
    fireEvent.mouseDown(refDropdown);

    const findSelectOption = (pattern: RegExp) =>
      Array.from(document.querySelectorAll('.ant-select-item-option')).find((el) =>
        pattern.test(el.textContent || ''),
      );

    await waitFor(() => {
      expect(findSelectOption(/Order #ORD-291/i)).toBeDefined();
      expect(findSelectOption(/Request #REQ-041/i)).toBeDefined();
      expect(findSelectOption(/^No reference$/i)).toBeDefined();
    });

    // Select Order #ORD-291
    fireEvent.click(findSelectOption(/Order #ORD-291/i)!);

    // Change selection to Request #REQ-041
    fireEvent.mouseDown(refDropdown);
    await waitFor(() => {
      expect(findSelectOption(/Request #REQ-041/i)).toBeDefined();
    });
    fireEvent.click(findSelectOption(/Request #REQ-041/i)!);

    // Change selection back to No reference
    fireEvent.mouseDown(refDropdown);
    await waitFor(() => {
      expect(findSelectOption(/^No reference$/i)).toBeDefined();
    });
    fireEvent.click(findSelectOption(/^No reference$/i)!);
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

  it('initializes form with empty subject, description, LOW severity, and none reference, resetting after submission', async () => {
    mockCreateComplaint.mockResolvedValue({
      ...mockComplaint,
      complaintId: 'CMP-NEW-101',
    });

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Undercooked chicken/i).length).toBeGreaterThan(0);
    });

    // Verify textarea starts empty
    const descInput = screen.getByPlaceholderText(
      /Please detail your experience/i,
    ) as HTMLTextAreaElement;
    expect(descInput.value).toBe('');

    // Default severity is LOW
    const lowBtn = screen.getByRole('button', { name: /Low/i });
    expect(lowBtn.getAttribute('aria-pressed')).toBe('true');

    // Default reference is No reference in collapsed dropdown
    const refDropdown = screen.getByRole('combobox', {
      name: /Link to order or request/i,
    });
    expect(refDropdown.getAttribute('aria-expanded')).not.toBe('true');
    expect(screen.getByText('No reference')).toBeDefined();

    // Fill valid description and submit
    fireEvent.change(descInput, { target: { value: 'Water leaking under the bathroom vanity.' } });
    const submitBtn = screen.getByRole('button', { name: /Submit Complaint/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateComplaint).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateComplaint).toHaveBeenCalledWith(
      expect.objectContaining({
        relatedOrderId: undefined,
        relatedRequestId: undefined,
      }),
      expect.any(String),
      expect.any(String),
    );

    // Form resets back to empty description
    expect(descInput.value).toBe('');
  });

  it('submits complaint with selected order reference and selected service request reference from dropdown', async () => {
    mockFetchGuestOrders.mockResolvedValue([
      {
        orderId: 'ORD-LONG-1234567890-ABCDEF',
        bookingId: 'BK-SRV-1',
        roomNumber: '401',
        status: 'DELIVERED',
        totalAmount: 1850,
        items: [
          {
            itemId: 'item-1',
            name: 'Extremely Long Dish Name That Wraps Cleanly On Mobile',
            unitPrice: 1850,
            quantity: 1,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [],
      },
    ]);
    mockFetchGuestServiceRequests.mockResolvedValue([
      {
        requestId: 'REQ-LONG-9876543210-XYZ',
        bookingId: 'BK-SRV-1',
        roomNumber: '401',
        requestType: 'MAINTENANCE',
        description: 'Air conditioner making loud rattling noise throughout the night',
        status: 'SUBMITTED',
        priority: 'NORMAL',
        assignedStaff: null,
        estimatedCompletionMinutes: 15,
        taskId: 'task-long',
        idempotencyKey: 'idemp-long',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [],
      },
    ]);
    mockCreateComplaint.mockResolvedValue({
      ...mockComplaint,
      complaintId: 'CMP-REF-1',
    });

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Undercooked chicken/i).length).toBeGreaterThan(0);
    });

    const refDropdown = screen.getByRole('combobox', {
      name: /Link to order or request/i,
    });
    fireEvent.mouseDown(refDropdown);

    const findSelectOption = (pattern: RegExp) =>
      Array.from(document.querySelectorAll('.ant-select-item-option')).find((el) =>
        pattern.test(el.textContent || ''),
      );

    await waitFor(() => {
      expect(findSelectOption(/Order #ORD-LONG-1234567890-ABCDEF/i)).toBeDefined();
      expect(findSelectOption(/Request #REQ-LONG-9876543210-XYZ/i)).toBeDefined();
    });

    // 1. Select order reference and submit
    fireEvent.click(findSelectOption(/Order #ORD-LONG-1234567890-ABCDEF/i)!);

    const descInput = screen.getByPlaceholderText(/Please detail your experience/i);
    fireEvent.change(descInput, { target: { value: 'Order arrived cold and missing utensils.' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Complaint/i }));

    await waitFor(() => {
      expect(mockCreateComplaint).toHaveBeenCalledWith(
        expect.objectContaining({
          relatedOrderId: 'ORD-LONG-1234567890-ABCDEF',
          relatedRequestId: undefined,
        }),
        expect.any(String),
        expect.any(String),
      );
    });

    // After submission, selection resets to No reference
    await waitFor(() => {
      expect(screen.getAllByText('No reference').length).toBeGreaterThan(0);
    });

    // 2. Select service request reference and submit
    fireEvent.mouseDown(refDropdown);
    await waitFor(() => {
      expect(findSelectOption(/Request #REQ-LONG-9876543210-XYZ/i)).toBeDefined();
    });
    fireEvent.click(findSelectOption(/Request #REQ-LONG-9876543210-XYZ/i)!);

    fireEvent.change(descInput, { target: { value: 'Maintenance issue still persists after visit.' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Complaint/i }));

    await waitFor(() => {
      expect(mockCreateComplaint).toHaveBeenCalledWith(
        expect.objectContaining({
          relatedOrderId: undefined,
          relatedRequestId: 'REQ-LONG-9876543210-XYZ',
        }),
        expect.any(String),
        expect.any(String),
      );
    });
  });

  it('filters out orders and service requests belonging to a different room or booking', async () => {
    mockFetchGuestOrders.mockResolvedValue([
      {
        orderId: 'ORD-FOREIGN',
        bookingId: 'BK-OTHER-ROOM',
        roomNumber: '999',
        status: 'DELIVERED',
        totalAmount: 1500,
        items: [{ itemId: 'item-1', name: 'Other Guest Meal', unitPrice: 1500, quantity: 1 }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [],
      },
      {
        orderId: 'ORD-VALID',
        bookingId: 'BK-SRV-1',
        roomNumber: '401',
        status: 'DELIVERED',
        totalAmount: 2200,
        items: [{ itemId: 'item-2', name: 'Valid Guest Meal', unitPrice: 2200, quantity: 1 }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [],
      },
    ]);
    mockFetchGuestServiceRequests.mockResolvedValue([
      {
        requestId: 'REQ-FOREIGN',
        bookingId: 'BK-OTHER-ROOM',
        roomNumber: '999',
        requestType: 'ROOM_CLEANING',
        status: 'SUBMITTED',
        priority: 'NORMAL',
        assignedStaff: null,
        estimatedCompletionMinutes: 15,
        taskId: 'task-f',
        idempotencyKey: 'idemp-f',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [],
      },
      {
        requestId: 'REQ-VALID',
        bookingId: 'BK-SRV-1',
        roomNumber: '401',
        requestType: 'EXTRA_TOWELS',
        status: 'SUBMITTED',
        priority: 'NORMAL',
        assignedStaff: null,
        estimatedCompletionMinutes: 15,
        taskId: 'task-v',
        idempotencyKey: 'idemp-v',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [],
      },
    ]);

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    const refDropdown = screen.getByRole('combobox', {
      name: /Link to order or request/i,
    });
    fireEvent.mouseDown(refDropdown);

    await waitFor(() => {
      expect(screen.getByText(/Order #ORD-VALID/i)).toBeDefined();
      expect(screen.getByText(/Request #REQ-VALID/i)).toBeDefined();
    });

    expect(screen.queryByText(/ORD-FOREIGN/i)).toBeNull();
    expect(screen.queryByText(/REQ-FOREIGN/i)).toBeNull();
  });

  it('hides evaluator status advance buttons in API mode', async () => {
    mockDataMode = 'api';
    mockFetchGuestComplaints.mockResolvedValueOnce([
      {
        ...mockComplaint,
        complaintId: 'CMP-API-MODE',
        status: 'SUBMITTED',
      },
    ]);

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('CMP-API-MODE')).toBeDefined();
    });

    // Evaluator buttons must NOT appear in API mode
    expect(screen.queryByRole('button', { name: /Start Investigation/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Escalate to GM/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mark Resolved/i })).toBeNull();
  });

  it('prevents stale complaint data when session changes during flight (AC2)', async () => {
    let resolveStaleComplaints: (data: any) => void;
    const stalePromise = new Promise((resolve) => {
      resolveStaleComplaints = resolve;
    });

    mockFetchGuestComplaints.mockImplementationOnce(() => stalePromise);
    mockFetchGuestOrders.mockResolvedValue([]);
    mockFetchGuestServiceRequests.mockResolvedValue([]);

    const { rerender } = render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    // Guest logs out or switches to unauthenticated session
    mockAuth = {
      ...mockAuth,
      sessionToken: null,
      guest: null,
      status: 'unauthenticated',
    };

    rerender(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    // Now stale promise resolves with Guest 1's complaint
    await act(async () => {
      resolveStaleComplaints!([
        {
          ...mockComplaint,
          complaintId: 'CMP-STALE-OLD',
          subject: 'Stale session complaint',
        },
      ]);
    });

    // The stale complaint must NOT be rendered because session was changed/cleared
    expect(screen.queryByText('CMP-STALE-OLD')).toBeNull();
  });

  it('formats reference labels cleanly without duplicate prefixes (AC3)', async () => {
    mockFetchGuestOrders.mockResolvedValue([
      {
        orderId: 'ORD-999',
        bookingId: 'BK-SRV-1',
        roomNumber: '401',
        totalAmount: 2500,
        items: [{ name: 'Rice Bowl' }],
      },
      {
        orderId: 'order-ORD-888',
        bookingId: 'BK-SRV-1',
        roomNumber: '401',
        totalAmount: 1800,
        items: [{ name: 'Fruit Salad' }],
      },
    ]);
    mockFetchGuestServiceRequests.mockResolvedValue([
      {
        requestId: 'REQ-777',
        bookingId: 'BK-SRV-1',
        roomNumber: '401',
        requestType: 'ROOM_CLEANING',
      },
      {
        requestId: 'req-REQ-666',
        bookingId: 'BK-SRV-1',
        roomNumber: '401',
        requestType: 'EXTRA_TOWELS',
      },
    ]);

    render(
      <Wrapper>
        <ComplaintsTab />
      </Wrapper>,
    );

    const refSelect = await screen.findByRole('combobox', {
      name: /Link to order or request/i,
    });
    await waitFor(() => {
      expect(mockFetchGuestOrders).toHaveBeenCalled();
      expect(mockFetchGuestServiceRequests).toHaveBeenCalled();
    });

    fireEvent.mouseDown(refSelect);

    await waitFor(() => {
      const optionTexts = Array.from(
        document.querySelectorAll('.ant-select-item-option'),
      ).map((el) => el.textContent ?? '');
      expect(optionTexts.some((t) => /Order #ORD-999/i.test(t))).toBe(true);
      expect(optionTexts.some((t) => /Order #ORD-888/i.test(t))).toBe(true);
      expect(optionTexts.some((t) => /Request #REQ-777/i.test(t))).toBe(true);
      expect(optionTexts.some((t) => /Request #REQ-666/i.test(t))).toBe(true);
      expect(optionTexts.some((t) => /ORD-ORD-/i.test(t))).toBe(false);
      expect(optionTexts.some((t) => /REQ-REQ-/i.test(t))).toBe(false);
    });
  });
});
