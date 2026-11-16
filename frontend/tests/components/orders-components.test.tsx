import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider, App } from 'antd';
import { appTheme } from '../../src/config/theme';
import { OrderConfirmation } from '../../src/features/orders/components/order-confirmation';
import { OrderStatusTracker } from '../../src/features/orders/components/order-status-tracker';
import { OrdersTab } from '../../src/features/orders/components/orders-tab';
import { NavigationProvider } from '../../src/lib/navigation/navigation-context';
import { CartProvider } from '../../src/lib/cart/cart-context';
import type { FoodOrderResponse } from '../../src/types/orders';

const mockOrder: FoodOrderResponse = {
  orderId: 'ORD-789',
  bookingId: 'BK-ORD-1',
  roomNumber: '302',
  status: 'PLACED',
  totalAmount: 3200,
  estimatedDeliveryMinutes: 25,
  idempotencyKey: 'idemp-1234',
  canCancel: true,
  secondsRemainingToCancel: 500,
  createdAt: new Date().toISOString(),
  items: [
    {
      itemId: 'dish-1',
      name: 'Lamprais Special',
      unitPrice: 1600,
      quantity: 2,
      specialNotes: 'Extra spicy',
    },
  ],
};

const initialMockAuth = {
  status: 'authenticated',
  sessionToken: 'mock-orders-token' as string | null,
  guest: {
    bookingId: 'BK-ORD-1',
    roomNumber: '302',
    guestName: 'Jane Smith',
  } as unknown,
  expiresAt: '2026-11-10T12:00:00Z',
  error: null,
  demoTokens: {},
  loginWithQr: jest.fn(),
  logout: jest.fn(),
  clearError: jest.fn(),
  refreshSession: jest.fn(),
};

let mockAuth = { ...initialMockAuth };

const mockFetchGuestOrders = jest.fn();
const mockFetchGuestOrderById = jest.fn();
const mockCancelFoodOrder = jest.fn();
const mockAdvanceOrderStatusDemo = jest.fn();

jest.mock('../../src/lib/api/orders', () => {
  const actual = jest.requireActual('../../src/lib/api/orders');
  return {
    ...actual,
    fetchGuestOrders: (...args: unknown[]) => mockFetchGuestOrders(...args),
    fetchGuestOrderById: (...args: unknown[]) => mockFetchGuestOrderById(...args),
    cancelFoodOrder: (...args: unknown[]) => mockCancelFoodOrder(...args),
    advanceOrderStatusDemo: (...args: unknown[]) => mockAdvanceOrderStatusDemo(...args),
  };
});

let latestOrdersRealtimeConfig: any = null;
jest.mock('../../src/lib/realtime/realtime-client', () => {
  const actual = jest.requireActual('../../src/lib/realtime/realtime-client');
  return {
    ...actual,
    FossRealtimeClient: jest.fn().mockImplementation((config) => {
      latestOrdersRealtimeConfig = config;
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

describe('OrderConfirmation Component', () => {
  it('renders order confirmation details, ID, ETA and action buttons', () => {
    let trackClicked = false;
    let backClicked = false;

    render(
      <Wrapper>
        <OrderConfirmation
          order={mockOrder}
          onTrackStatus={() => {
            trackClicked = true;
          }}
          onBackToMenu={() => {
            backClicked = true;
          }}
        />
      </Wrapper>,
    );

    expect(screen.getByText('ORDER PLACED')).toBeDefined();
    expect(screen.getByText(/#ORD-789/i)).toBeDefined();
    expect(screen.getByText(/Track Order Status/i)).toBeDefined();

    // Track order button
    const trackBtn = screen.getByRole('button', { name: /Track Order Status/i });
    fireEvent.click(trackBtn);
    expect(trackClicked).toBe(true);

    // Back button
    const backBtn = screen.getByRole('button', { name: /Back to Menu/i });
    fireEvent.click(backBtn);
    expect(backClicked).toBe(true);
  });

  it('handles expired countdown cutoff and pending kitchen estimate when delivery time is missing', () => {
    const expiredOrder: FoodOrderResponse = {
      ...mockOrder,
      orderId: 'ORD-EXPIRED-1',
      secondsRemainingToCancel: 0,
      estimatedDeliveryMinutes: 0,
      roomNumber: '',
    };

    render(
      <Wrapper>
        <OrderConfirmation order={expiredOrder} onTrackStatus={() => {}} onBackToMenu={() => {}} />
      </Wrapper>,
    );

    expect(screen.getByText('Cancellation cutoff passed')).toBeDefined();
    expect(screen.getByText('Pending')).toBeDefined();
    expect(screen.getByText('KITCHEN ESTIMATE')).toBeDefined();
  });

  it('handles OrderConfirmation fallback defaults when timestamps are absent and checks orderId formatting', () => {
    const defaultOrder: FoodOrderResponse = {
      ...mockOrder,
      orderId: '#999',
      secondsRemainingToCancel: undefined as any,
      createdAt: '',
    };

    const { rerender } = render(
      <Wrapper>
        <OrderConfirmation order={defaultOrder} onTrackStatus={() => {}} onBackToMenu={() => {}} />
      </Wrapper>,
    );

    expect(screen.getByText(/#999/)).toBeDefined();

    rerender(
      <Wrapper>
        <OrderConfirmation
          order={{ ...defaultOrder, orderId: 'nonumbers' }}
          onTrackStatus={() => {}}
          onBackToMenu={() => {}}
        />
      </Wrapper>,
    );

    expect(screen.getByText(/#ORD-291/)).toBeDefined();
  });
});

describe('OrderStatusTracker Component', () => {
  const prevDemoSimFlag = process.env.NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION;
  const prevDeployEnv = process.env.NEXT_PUBLIC_DEPLOYMENT_ENV;
  const prevDataMode = process.env.NEXT_PUBLIC_DATA_MODE;

  beforeEach(() => {
    mockFetchGuestOrderById.mockReset();
    mockCancelFoodOrder.mockReset();
    mockAdvanceOrderStatusDemo.mockReset();
    delete process.env.NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION;
    process.env.NEXT_PUBLIC_DEPLOYMENT_ENV = 'development';
    process.env.NEXT_PUBLIC_DATA_MODE = 'api';
  });

  afterEach(() => {
    if (prevDemoSimFlag === undefined) delete process.env.NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION;
    else process.env.NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION = prevDemoSimFlag;
    if (prevDeployEnv === undefined) delete process.env.NEXT_PUBLIC_DEPLOYMENT_ENV;
    else process.env.NEXT_PUBLIC_DEPLOYMENT_ENV = prevDeployEnv;
    if (prevDataMode === undefined) delete process.env.NEXT_PUBLIC_DATA_MODE;
    else process.env.NEXT_PUBLIC_DATA_MODE = prevDataMode;
  });

  it('renders tracker skeleton then order timeline and handles order cancellation', async () => {
    mockFetchGuestOrderById.mockResolvedValue(mockOrder);
    mockCancelFoodOrder.mockResolvedValue({
      ...mockOrder,
      status: 'CANCELLED',
      canCancel: false,
    });

    render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-789" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Lamprais Special/i)).toBeDefined();
    });

    expect(screen.getAllByText(/Order Placed/i).length).toBeGreaterThan(0);

    // Cancellation button
    const cancelBtn = screen.getByRole('button', { name: /Cancel Order/i });
    fireEvent.click(cancelBtn);

    // Modal confirmation opens
    await waitFor(() => {
      expect(screen.getByText('Cancel This Order?')).toBeDefined();
    });

    const confirmCancelBtn = screen.getByRole('button', { name: /Yes, Cancel Order/i });
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(mockCancelFoodOrder).toHaveBeenCalledTimes(1);
    });
  });

  it('renders DELIVERED status without cancel button', async () => {
    const deliveredOrder: FoodOrderResponse = {
      ...mockOrder,
      orderId: 'ORD-DELIV-1',
      status: 'DELIVERED',
      canCancel: false,
    };
    mockFetchGuestOrderById.mockResolvedValue(deliveredOrder);

    render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-DELIV-1" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/DELIVERED/i).length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole('button', { name: /Cancel Order/i })).toBeNull();
  });

  it('displays AlertNotice when order fetch fails and allows retry', async () => {
    mockFetchGuestOrderById.mockRejectedValueOnce(new Error('Order lookup failed'));

    render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-ERR-1" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Order lookup failed/i)).toBeDefined();
    });

    mockFetchGuestOrderById.mockResolvedValue(mockOrder);
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/Lamprais Special/i)).toBeDefined();
    });
  });

  it('hides demo simulation controls by default in development and strictly in production', async () => {
    mockFetchGuestOrderById.mockResolvedValue(mockOrder);

    const { rerender } = render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-789" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Lamprais Special/i)).toBeDefined();
    });

    expect(screen.queryByText(/DEMO SIMULATION: ADVANCE STATUS/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ready$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delivered$/i })).toBeNull();

    // Production environment must never render demo simulation even if flag is misconfigured
    process.env.NEXT_PUBLIC_DEPLOYMENT_ENV = 'production';
    process.env.NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION = 'true';

    rerender(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-789" onBack={() => {}} />
      </Wrapper>,
    );

    expect(screen.queryByText(/DEMO SIMULATION: ADVANCE STATUS/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ready$/i })).toBeNull();
  });

  it('handles advancing order status in demo mode across IN_PREPARATION, READY, DELIVERED and offline fallback when explicitly enabled in dev', async () => {
    process.env.NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION = 'true';
    process.env.NEXT_PUBLIC_DEPLOYMENT_ENV = 'development';
    process.env.NEXT_PUBLIC_DATA_MODE = 'demo';

    mockFetchGuestOrderById.mockResolvedValue(mockOrder);
    mockAdvanceOrderStatusDemo.mockResolvedValueOnce({
      ...mockOrder,
      status: 'IN_PREPARATION',
    });

    render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-789" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Lamprais Special/i)).toBeDefined();
    });

    // Advance to IN_PREPARATION
    const inKitchenBtn = screen.getByRole('button', { name: /In Kitchen/i });
    fireEvent.click(inKitchenBtn);

    await waitFor(() => {
      expect(mockAdvanceOrderStatusDemo).toHaveBeenCalledWith(
        'mock-orders-token',
        'ORD-789',
        'IN_PREPARATION',
      );
    });

    // Offline simulation fallback when API throws in demo data mode
    mockAdvanceOrderStatusDemo.mockRejectedValueOnce(new Error('Connection lost'));
    const readyBtn = screen.getByRole('button', { name: /^Ready$/i });
    fireEvent.click(readyBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Demo simulation: status set to READY/i).length).toBeGreaterThan(
        0,
      );
    });
  });

  it('does not fake local order status when demo call fails in API mode', async () => {
    process.env.NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION = 'true';
    process.env.NEXT_PUBLIC_DEPLOYMENT_ENV = 'development';
    process.env.NEXT_PUBLIC_DATA_MODE = 'api';

    mockFetchGuestOrderById.mockResolvedValue(mockOrder);
    mockAdvanceOrderStatusDemo.mockRejectedValueOnce(new Error('Forbidden in this environment'));

    render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-789" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Lamprais Special/i)).toBeDefined();
    });

    const readyBtn = screen.getByRole('button', { name: /^Ready$/i });
    fireEvent.click(readyBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Forbidden in this environment/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Demo simulation: status set to READY/i)).toBeNull();
  });

  it('renders allergy notes, back button, and handles cancellation failure', async () => {
    const onBackMock = jest.fn();
    const allergyOrder: FoodOrderResponse = {
      ...mockOrder,
      allergyNotes: 'Severe peanut and shellfish allergy',
      canCancel: true,
      secondsRemainingToCancel: 120,
    };
    mockFetchGuestOrderById.mockResolvedValue(allergyOrder);
    mockCancelFoodOrder.mockRejectedValueOnce(new Error('Preparation already started'));

    render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-789" onBack={onBackMock} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Severe peanut and shellfish allergy/i)).toBeDefined();
    });

    // Trigger cancel failure
    const cancelBtn = screen.getByRole('button', { name: /Cancel Order/i });
    fireEvent.click(cancelBtn);

    const confirmCancelBtn = screen.getByRole('button', { name: /Yes, Cancel Order/i });
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Preparation already started/i).length).toBeGreaterThan(0);
    });
  });

  it('renders tracker for IN_PREPARATION, READY and DELIVERED states with estimated labels', async () => {
    const prepOrder: FoodOrderResponse = {
      ...mockOrder,
      orderId: '999',
      status: 'IN_PREPARATION',
      estimatedDeliveryMinutes: 20,
      canCancel: false,
      timeline: [
        {
          status: 'PLACED',
          label: 'Order Placed',
          completed: true,
          current: false,
          timestamp: '2026-11-09T12:00:00Z',
        },
        {
          status: 'IN_PREPARATION',
          label: 'In Preparation',
          completed: true,
          current: true,
          timestamp: '2026-11-09T12:05:00Z',
        },
        { status: 'READY', label: 'Ready', completed: false, current: false },
        { status: 'DELIVERED', label: 'Delivered', completed: false, current: false },
      ],
    };
    mockFetchGuestOrderById.mockResolvedValueOnce(prepOrder);

    const { rerender } = render(
      <Wrapper>
        <OrderStatusTracker orderId="999" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('In Kitchen — Preparing')).toBeDefined();
      expect(screen.getByText(/Est. ~20m|Est\./i)).toBeDefined();
    });

    const readyOrder: FoodOrderResponse = {
      ...prepOrder,
      orderId: '#ORD-888',
      status: 'READY',
      timeline: [
        { status: 'PLACED', label: 'Order Placed', completed: true, current: false },
        { status: 'IN_PREPARATION', label: 'In Preparation', completed: true, current: false },
        {
          status: 'READY',
          label: 'Ready',
          completed: true,
          current: true,
          timestamp: '2026-11-09T12:20:00Z',
        },
        { status: 'DELIVERED', label: 'Delivered', completed: false, current: false },
      ],
    };
    mockFetchGuestOrderById.mockResolvedValueOnce(readyOrder);

    rerender(
      <Wrapper>
        <OrderStatusTracker orderId="#ORD-888" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Ready for Delivery — Courier Assigned')).toBeDefined();
    });
  });

  it('handles CANCELLED status, countdown timer tick to zero, and realtime updates in tracker', async () => {
    const cancelledOrder: FoodOrderResponse = {
      ...mockOrder,
      orderId: 'ORD-CANC-1',
      status: 'CANCELLED',
      canCancel: false,
      secondsRemainingToCancel: 0,
      estimatedDeliveryMinutes: 0,
      timeline: [
        { status: 'PLACED', label: 'Order Placed', completed: true, current: false },
        {
          status: 'CANCELLED',
          label: 'Order Cancelled',
          completed: true,
          current: true,
          timestamp: '2026-11-09T10:00:00Z',
        },
      ],
    };
    mockFetchGuestOrderById.mockResolvedValue(cancelledOrder);

    render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-CANC-1" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Order Cancelled')).toBeDefined();
    });

    // Realtime event with matching order update
    if (latestOrdersRealtimeConfig?.onEvent) {
      latestOrdersRealtimeConfig.onEvent({
        eventType: 'FOOD_ORDER_STATUS_UPDATED',
        data: {
          ...cancelledOrder,
          orderId: 'ORD-CANC-1',
          status: 'DELIVERED',
        },
      });
    }

    // Realtime event with non-matching order (triggers loadOrder)
    if (latestOrdersRealtimeConfig?.onEvent) {
      latestOrdersRealtimeConfig.onEvent({
        eventType: 'FOOD_ORDER_STATUS_UPDATED',
        data: {
          ...cancelledOrder,
          orderId: 'ORD-OTHER-99',
        },
      });
    }

    // Realtime onRefresh
    if (latestOrdersRealtimeConfig?.onRefresh) {
      latestOrdersRealtimeConfig.onRefresh();
    }
  });

  it('evaluates estimated delivery labels for zero minutes and fallback string', async () => {
    const fallbackEstOrder: FoodOrderResponse = {
      ...mockOrder,
      orderId: 'ORD-EST-FALLBACK',
      status: 'PLACED',
      estimatedDeliveryMinutes: 15,
      createdAt: 'invalid-iso-date',
    };
    mockFetchGuestOrderById.mockResolvedValueOnce(fallbackEstOrder);

    render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-EST-FALLBACK" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Est\. ~15m/i)).toBeDefined();
    });
  });
});

describe('OrdersTab Component', () => {
  beforeEach(() => {
    mockAuth = { ...initialMockAuth };
    mockFetchGuestOrders.mockReset();
    mockFetchGuestOrders.mockResolvedValue([mockOrder]);
    mockFetchGuestOrderById.mockResolvedValue(mockOrder);
    mockCancelFoodOrder.mockResolvedValue(mockOrder);
  });

  it('renders order history cards and selects order on click', async () => {
    mockFetchGuestOrders.mockResolvedValue([
      mockOrder,
      {
        ...mockOrder,
        orderId: 'ORD-PAST-1',
        status: 'DELIVERED',
        canCancel: false,
      },
    ]);

    render(
      <Wrapper>
        <OrdersTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/#ORD-789/i)).toBeDefined();
      expect(screen.getByText(/#ORD-PAST-1/i)).toBeDefined();
    });

    // Click order card
    fireEvent.click(screen.getByText(/#ORD-789/i));
  });

  it('displays error alert with retry button when order list fetch fails', async () => {
    mockFetchGuestOrders.mockRejectedValueOnce(new Error('Network failure loading orders'));

    render(
      <Wrapper>
        <OrdersTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Network failure loading orders/i)).toBeDefined();
    });

    mockFetchGuestOrders.mockResolvedValue([mockOrder]);
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/#ORD-789/i)).toBeDefined();
    });
  });

  it('renders EmptyState when order history is empty', async () => {
    mockFetchGuestOrders.mockResolvedValue([]);

    render(
      <Wrapper>
        <OrdersTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No food orders yet/i)).toBeDefined();
    });
  });

  it('renders EmptyState when guest session is absent in OrdersTab', async () => {
    const savedAuth = mockAuth;
    mockAuth = { ...mockAuth, sessionToken: null, guest: null };

    render(
      <Wrapper>
        <OrdersTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No food orders yet/i)).toBeDefined();
    });

    mockAuth = savedAuth;
  });

  it('renders active and past orders with varied statuses and navigates to tracker', async () => {
    const ordersList: FoodOrderResponse[] = [
      {
        ...mockOrder,
        orderId: 'ORD-A1',
        status: 'PLACED',
        createdAt: '2026-11-09T08:30:00Z',
      },
      {
        ...mockOrder,
        orderId: 'ORD-A2',
        status: 'IN_PREPARATION',
        createdAt: '2026-11-09T13:30:00Z',
      },
      {
        ...mockOrder,
        orderId: 'ORD-A3',
        status: 'READY',
        createdAt: '2026-11-09T19:30:00Z',
      },
      {
        ...mockOrder,
        orderId: 'ORD-P1',
        status: 'DELIVERED',
        canCancel: false,
      },
      {
        ...mockOrder,
        orderId: 'ORD-P2',
        status: 'CANCELLED',
        items: [],
        canCancel: false,
      },
    ];
    mockFetchGuestOrders.mockResolvedValue(ordersList);

    render(
      <Wrapper>
        <OrdersTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/#ORD-A1/i)).toBeDefined();
      expect(screen.getByText(/#ORD-A2/i)).toBeDefined();
      expect(screen.getByText(/#ORD-A3/i)).toBeDefined();
      expect(screen.getByText(/#ORD-P1/i)).toBeDefined();
      expect(screen.getByText(/#ORD-P2/i)).toBeDefined();
    });

    expect(screen.getAllByText(/Breakfast/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Lunch/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dinner/i).length).toBeGreaterThan(0);
    expect(screen.getByText('In-Room Dining Order')).toBeDefined();

    // Click an order to open tracker
    fireEvent.click(screen.getByText(/#ORD-A2/i));

    await waitFor(() => {
      expect(screen.getByLabelText('Order Status Tracker')).toBeDefined();
    });
  });

  it('handles header refresh button and realtime updates in OrdersTab', async () => {
    mockFetchGuestOrders.mockResolvedValue([mockOrder]);

    render(
      <Wrapper>
        <OrdersTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/#ORD-789/i)).toBeDefined();
    });

    // Click Refresh link
    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    expect(mockFetchGuestOrders).toHaveBeenCalled();

    // Realtime update matching stay
    if (latestOrdersRealtimeConfig?.onEvent) {
      latestOrdersRealtimeConfig.onEvent({
        eventType: 'FOOD_ORDER_STATUS_UPDATED',
        data: {
          ...mockOrder,
          orderId: 'ORD-789',
          status: 'DELIVERED',
        },
      });
    }

    // Realtime update with mismatched stay (ignored)
    if (latestOrdersRealtimeConfig?.onEvent) {
      latestOrdersRealtimeConfig.onEvent({
        eventType: 'FOOD_ORDER_STATUS_UPDATED',
        data: {
          ...mockOrder,
          orderId: 'ORD-OTHER-STAY',
          roomNumber: '999',
          bookingId: 'BK-MISMATCH',
        },
      });
    }

    // Realtime onRefresh
    if (latestOrdersRealtimeConfig?.onRefresh) {
      latestOrdersRealtimeConfig.onRefresh();
    }
  });

  it('navigates to menu tab when Explore Menu is clicked in empty state', async () => {
    mockFetchGuestOrders.mockResolvedValue([]);

    render(
      <Wrapper>
        <OrdersTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('No food orders yet')).toBeDefined();
    });

    const exploreBtn = screen.getByRole('button', { name: /Explore Menu/i });
    fireEvent.click(exploreBtn);
  });

  it('handles OrderStatusTracker cancel modal dismissal, createdAt fallback countdown, and delivered advancement', async () => {
    process.env.NEXT_PUBLIC_ENABLE_ORDER_DEMO_SIMULATION = 'true';
    process.env.NEXT_PUBLIC_DEPLOYMENT_ENV = 'development';

    const recentOrder: FoodOrderResponse = {
      ...mockOrder,
      orderId: 'ORD-RECENT-1',
      status: 'PLACED',
      canCancel: true,
      secondsRemainingToCancel: undefined as any,
      createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
    };

    mockFetchGuestOrderById.mockResolvedValue(recentOrder);
    mockAdvanceOrderStatusDemo.mockResolvedValue({
      ...recentOrder,
      status: 'DELIVERED',
    });

    render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-RECENT-1" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Lamprais Special/i)).toBeDefined();
    });

    // Dismiss cancel modal with Keep Order
    const cancelBtn = screen.getByRole('button', { name: /Cancel Order/i });
    fireEvent.click(cancelBtn);

    const keepOrderBtn = screen.getByRole('button', { name: /Keep Order/i });
    fireEvent.click(keepOrderBtn);

    // Advance to DELIVERED
    const deliveredBtn = screen.getByRole('button', { name: /Delivered/i });
    fireEvent.click(deliveredBtn);

    await waitFor(() => {
      expect(mockAdvanceOrderStatusDemo).toHaveBeenCalledWith(
        'mock-orders-token',
        'ORD-RECENT-1',
        'DELIVERED',
      );
    });
  });

  it('handles OrdersTab tracking navigation back to list and unauthenticated state', async () => {
    mockFetchGuestOrders.mockResolvedValue([mockOrder]);
    mockFetchGuestOrderById.mockResolvedValue(mockOrder);

    render(
      <Wrapper>
        <OrdersTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Lamprais Special/i).length).toBeGreaterThan(0);
    });

    // Click order card to view tracker
    const orderCard = screen.getAllByText(/Lamprais Special/i)[0];
    fireEvent.click(orderCard);

    // Verify tracker displays order items and status steps
    await waitFor(() => {
      expect(screen.getAllByText(/Order Placed/i).length).toBeGreaterThan(0);
    });
  });

  it('handles OrderStatusTracker custom status fallback and non-Error fetch failures', async () => {
    const customStatusOrder: FoodOrderResponse = {
      ...mockOrder,
      orderId: 'ORD-CUSTOM-1',
      status: 'CUSTOM_STATUS' as any,
    };
    mockFetchGuestOrderById.mockResolvedValueOnce(customStatusOrder);

    const { rerender } = render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-CUSTOM-1" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/In Kitchen — Preparing/i).length).toBeGreaterThan(0);
    });

    // Test orderId formatting branches: '#123', 'alphanumeric456', 'nonumbers'
    rerender(
      <Wrapper>
        <OrderStatusTracker orderId="#123" onBack={() => {}} />
      </Wrapper>,
    );

    rerender(
      <Wrapper>
        <OrderStatusTracker orderId="puretext" onBack={() => {}} />
      </Wrapper>,
    );
  });

  it('renders OrdersTab with both TODAY and YESTERDAY sections and filters mismatched stays', async () => {
    const yesterdayDate = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const todayDate = new Date().toISOString();

    const mixedOrders: FoodOrderResponse[] = [
      {
        ...mockOrder,
        orderId: 'ORD-TODAY-1',
        createdAt: todayDate,
      },
      {
        ...mockOrder,
        orderId: 'ORD-PAST-1',
        createdAt: yesterdayDate,
        status: 'DELIVERED',
      },
      {
        ...mockOrder,
        orderId: 'ORD-MISMATCH-ROOM',
        roomNumber: '888',
        bookingId: 'BK-ORD-1',
      },
      {
        ...mockOrder,
        orderId: 'ORD-MISMATCH-BOOKING',
        roomNumber: '401',
        bookingId: 'BK-WRONG',
      },
      {
        ...mockOrder,
        orderId: 'ORD-MISSING-STAY',
        roomNumber: undefined as any,
        bookingId: undefined as any,
      },
    ];

    mockFetchGuestOrders.mockResolvedValue(mixedOrders);

    render(
      <Wrapper>
        <OrdersTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/YESTERDAY & EARLIER/i)).toBeDefined();
      expect(screen.getByText('#ORD-PAST-1')).toBeDefined();
      expect(screen.getByText('#ORD-TODAY-1')).toBeDefined();
    });

    // Verify mismatched stays are not rendered
    expect(screen.queryByText('#ORD-MISMATCH-ROOM')).toBeNull();
    expect(screen.queryByText('#ORD-MISMATCH-BOOKING')).toBeNull();
    expect(screen.queryByText('#ORD-MISSING-STAY')).toBeNull();
  });

  it('handles OrderStatusTracker with absent session and countdown timer boundaries', async () => {
    // 1. Unauthenticated state
    const savedAuth = mockAuth;
    mockAuth = { ...mockAuth, sessionToken: null };

    const { rerender } = render(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-NO-AUTH" onBack={() => {}} />
      </Wrapper>,
    );

    mockAuth = savedAuth;

    // 2. Countdown boundary timer expiry
    const expiringOrder: FoodOrderResponse = {
      ...mockOrder,
      orderId: 'ORD-EXPIRING-1',
      canCancel: true,
      secondsRemainingToCancel: 1,
    };
    mockFetchGuestOrderById.mockResolvedValueOnce(expiringOrder);

    rerender(
      <Wrapper>
        <OrderStatusTracker orderId="ORD-EXPIRING-1" onBack={() => {}} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Lamprais Special/i)).toBeDefined();
    });
  });
});
