import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CartView } from '../../src/features/cart/components/cart-view';
import { CartProvider } from '../../src/lib/cart/cart-context';
import { getCartStorageKey } from '../../src/lib/cart/cart-storage';
import { NavigationProvider } from '../../src/lib/navigation/navigation-context';
import { ConfigProvider, App } from 'antd';
import { appTheme } from '../../src/config/theme';
import type { GuestMenuItem } from '../../src/types/menu';

const mockItem: GuestMenuItem = {
  id: 'item-1',
  name: 'Seafood Kottu',
  description: 'Spicy shredded flatbread with seafood',
  price: 1200,
  category: 'MAINS',
  available: true,
  isOrderable: true,
  isCutoff: false,
  secondsRemainingUntilCutoff: 3600,
  estimatedPrepMinutes: 15,
  imageUrl: null,
  dietaryFlags: [],
  allergens: [],
  mealPeriods: ['DINNER'],
  portionCap: 3,
};

const mockGuest = {
  bookingId: 'BK-101',
  roomNumber: '101',
  guestName: 'Jane Doe',
  checkInDate: '2026-11-09T10:00:00Z',
  checkOutDate: '2026-11-12T10:00:00Z',
};

let mockSessionToken: string | null = 'mock-session-token';
let mockGuestState: typeof mockGuest | null = mockGuest;

jest.mock('../../src/lib/auth/auth-context', () => {
  const actual = jest.requireActual('../../src/lib/auth/auth-context');
  return {
    ...actual,
    useAuth: () => ({
      status: mockSessionToken ? 'authenticated' : 'idle',
      sessionToken: mockSessionToken,
      guest: mockGuestState,
      expiresAt: '2026-11-10T12:00:00Z',
      error: null,
      demoTokens: {},
      loginWithQr: jest.fn(),
      logout: jest.fn(),
      clearError: jest.fn(),
      refreshSession: jest.fn(),
    }),
  };
});

const mockPlaceFoodOrder = jest.fn();

jest.mock('../../src/lib/api/orders', () => ({
  generateIdempotencyKey: () => 'mock-idempotency-key',
  placeFoodOrder: (...args: unknown[]) => mockPlaceFoodOrder(...args),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
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

function seedStoredCart(quantity = 1, allergy = '') {
  const cartKey = getCartStorageKey('BK-101', '101');
  window.sessionStorage.setItem(
    cartKey,
    JSON.stringify({
      bookingId: 'BK-101',
      roomNumber: '101',
      items: [{ id: 'item-1', item: mockItem, quantity }],
      allergyNote: allergy,
    }),
  );
}

describe('CartView Component', () => {
  beforeEach(() => {
    mockSessionToken = 'mock-session-token';
    mockGuestState = mockGuest;
    mockPlaceFoodOrder.mockReset();
    window.sessionStorage.clear();
  });

  it('renders empty cart state and triggers onBack when Browse Menu is clicked', () => {
    let backTriggered = false;
    render(
      <TestWrapper>
        <CartView
          onBack={() => {
            backTriggered = true;
          }}
        />
      </TestWrapper>,
    );

    expect(screen.getByText(/Your Cart is Empty/i)).toBeDefined();
    const browseBtn = screen.getByText('Browse Menu');
    fireEvent.click(browseBtn);
    expect(backTriggered).toBe(true);
  });

  it('renders items in cart, allows increment, decrement, allergy notes and places order', async () => {
    seedStoredCart(1);

    mockPlaceFoodOrder.mockResolvedValueOnce({
      orderId: 'ORD-9988',
      bookingId: 'BK-101',
      roomNumber: '101',
      status: 'PLACED',
      totalAmount: 2400,
      estimatedDeliveryMinutes: 30,
      idempotencyKey: 'mock-idempotency-key',
      items: [
        {
          itemId: 'item-1',
          name: 'Seafood Kottu',
          unitPrice: 1200,
          quantity: 2,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let placedOrderResult: unknown = null;

    render(
      <TestWrapper>
        <CartView
          onBack={() => {}}
          onPlaceOrder={(order) => {
            placedOrderResult = order;
          }}
        />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Seafood Kottu')).toBeDefined();
    });

    expect(screen.getByText('Total', { exact: true })).toBeDefined();

    // Increment quantity
    const incBtn = screen.getByRole('button', { name: /Increase quantity/i });
    fireEvent.click(incBtn);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeDefined();
    });

    // Allergy note input
    const noteArea = screen.getByPlaceholderText(/allergic to peanuts/i);
    fireEvent.change(noteArea, { target: { value: 'No shellfish please' } });
    expect(noteArea).toHaveProperty('value', 'No shellfish please');

    // Place order
    const placeBtn = screen.getByRole('button', { name: /Place Order/i });
    fireEvent.click(placeBtn);

    await waitFor(() => {
      expect(mockPlaceFoodOrder).toHaveBeenCalledTimes(1);
    });

    // Should transition to OrderConfirmation view
    await waitFor(() => {
      expect(screen.getByText(/Order Confirmed/i)).toBeDefined();
    });
    expect(placedOrderResult).not.toBeNull();
  });

  it('handles order failure gracefully with error alert', async () => {
    seedStoredCart(1);
    mockPlaceFoodOrder.mockRejectedValueOnce(new Error('Kitchen is currently overloaded'));

    render(
      <TestWrapper>
        <CartView onBack={() => {}} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Seafood Kottu')).toBeDefined();
    });

    const placeBtn = screen.getByRole('button', { name: /Place Order/i });
    fireEvent.click(placeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Kitchen is currently overloaded/i)).toBeDefined();
    });
  });

  it('allows decreasing item quantity to empty the cart', async () => {
    seedStoredCart(1);

    render(
      <TestWrapper>
        <CartView onBack={() => {}} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Seafood Kottu')).toBeDefined();
    });

    const decBtn = screen.getByRole('button', { name: /Decrease quantity/i });
    fireEvent.click(decBtn);

    await waitFor(() => {
      expect(screen.getByText(/Your Cart is Empty/i)).toBeDefined();
    });
  });

  it('handles order confirmation navigation to track status and menu', async () => {
    seedStoredCart(1);
    let backTriggered = false;

    mockPlaceFoodOrder.mockResolvedValueOnce({
      orderId: 'ORD-TRACK-1',
      bookingId: 'BK-101',
      roomNumber: '101',
      status: 'PLACED',
      totalAmount: 1200,
      estimatedDeliveryMinutes: 20,
      items: [{ itemId: 'item-1', name: 'Seafood Kottu', unitPrice: 1200, quantity: 1 }],
      createdAt: new Date().toISOString(),
    });

    render(
      <TestWrapper>
        <CartView
          onBack={() => {
            backTriggered = true;
          }}
        />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Seafood Kottu')).toBeDefined();
    });

    const placeBtn = screen.getByRole('button', { name: /Place Order/i });
    fireEvent.click(placeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Track Order Status/i)).toBeDefined();
    });

    // Clicking Track Order Status triggers navigation and onBack
    const trackBtn = screen.getByRole('button', { name: /Track Order Status/i });
    fireEvent.click(trackBtn);
    expect(backTriggered).toBe(true);
  });

  it('handles policy violation when item quantity exceeds max allowed', async () => {
    seedStoredCart(25);

    render(
      <TestWrapper>
        <CartView onBack={() => {}} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Seafood Kottu')).toBeDefined();
    });

    const placeBtn = screen.getByRole('button', { name: /Place Order/i });
    fireEvent.click(placeBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Quantity for Seafood Kottu must be between 1 and 20/i),
      ).toBeDefined();
    });
  });
});
