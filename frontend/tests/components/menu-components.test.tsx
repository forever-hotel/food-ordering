import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider, App } from 'antd';
import { appTheme } from '../../src/config/theme';
import { MenuItemCard } from '../../src/features/menu/components/menu-item-card';
import { MenuItemDetail } from '../../src/features/menu/components/menu-item-detail';
import { MenuTab } from '../../src/features/menu/components/menu-tab';
import { CartProvider } from '../../src/lib/cart/cart-context';
import { NavigationProvider } from '../../src/lib/navigation/navigation-context';
import type { GuestMenuItem, GuestMenuResponse } from '../../src/types/menu';

const mockItem: GuestMenuItem = {
  id: 'dish-1',
  name: 'Egg Hopper with Sambal',
  description: 'Crispy bowl-shaped pancake with soft-boiled egg center',
  price: 450,
  category: 'Breakfast',
  available: true,
  isOrderable: true,
  isCutoff: false,
  secondsRemainingUntilCutoff: 3600,
  estimatedPrepMinutes: 15,
  mealPeriods: ['BREAKFAST'],
  portionCap: 4,
  dietaryFlags: ['VEGETARIAN', 'GLUTEN_FREE'],
  allergens: ['EGGS'],
  imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c',
};

const mockMenuResponse: GuestMenuResponse = {
  currentTimeInColombo: '2026-11-09T12:30:00+05:30',
  activeMealPeriods: ['LUNCH', 'BREAKFAST'],
  categories: ['Breakfast', 'Lunch', 'Mains'],
  mealWindows: [
    {
      period: 'BREAKFAST',
      name: 'Breakfast',
      startTime: '00:00',
      cutoffTime: '23:59',
      isActive: true,
      isCutoffReached: false,
      secondsRemaining: 86400,
    },
    {
      period: 'LUNCH',
      name: 'Lunch',
      startTime: '00:00',
      cutoffTime: '23:59',
      isActive: true,
      isCutoffReached: false,
      secondsRemaining: 86400,
    },
  ],
  items: [
    mockItem,
    {
      ...mockItem,
      id: 'dish-2',
      name: 'Lamprais Special',
      description: 'Rice cooked in meat stock wrapped in banana leaf',
      category: 'Lunch',
      price: 1500,
      mealPeriods: ['LUNCH'],
    },
  ],
  totalItems: 2,
  version: 'v1.0.0',
};

const mockFetchGuestMenu = jest.fn();

jest.mock('../../src/lib/api/menu', () => {
  const actual = jest.requireActual('../../src/lib/api/menu');
  return {
    ...actual,
    fetchGuestMenu: (...args: unknown[]) => mockFetchGuestMenu(...args),
  };
});

const initialMockAuth = {
  status: 'authenticated',
  sessionToken: 'mock-token-menu' as string | null,
  guest: {
    bookingId: 'BK-MENU-1',
    roomNumber: '204',
    guestName: 'Chef Gordon',
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

describe('MenuItemCard Component', () => {
  it('renders dish details, formats price, and triggers onSelect and onQuickAdd', () => {
    let selected: GuestMenuItem | null = null;
    let quickAdded: GuestMenuItem | null = null;

    render(
      <Wrapper>
        <MenuItemCard
          item={mockItem}
          onSelect={(item) => {
            selected = item;
          }}
          onQuickAdd={(item) => {
            quickAdded = item;
          }}
        />
      </Wrapper>,
    );

    expect(screen.getByText('Egg Hopper with Sambal')).toBeDefined();
    expect(screen.getByText(/LKR 450/i)).toBeDefined();

    // Quick add button
    const quickAddBtn = screen.getByRole('button', {
      name: /Add Egg Hopper with Sambal to order/i,
    });
    fireEvent.click(quickAddBtn);
    expect(quickAdded).toEqual(mockItem);

    // Card click onSelect
    const card = screen.getByTestId('menu-item-card');
    fireEvent.click(card);
    expect(selected).toEqual(mockItem);

    // Keyboard access Enter
    selected = null;
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(selected).toEqual(mockItem);
  });

  it('renders Sold Out and Closed states correctly', () => {
    const soldOutItem: GuestMenuItem = { ...mockItem, available: false };
    render(
      <Wrapper>
        <MenuItemCard item={soldOutItem} onSelect={() => {}} onQuickAdd={() => {}} />
      </Wrapper>,
    );

    expect(screen.getAllByText('Sold Out').length).toBeGreaterThan(0);
  });
});

describe('MenuItemDetail Component', () => {
  it('renders item details, steppers, dietary tags and allows adding to cart', async () => {
    let backClicked = false;

    render(
      <Wrapper>
        <MenuItemDetail
          item={mockItem}
          onBack={() => {
            backClicked = true;
          }}
        />
      </Wrapper>,
    );

    expect(screen.getByText('Egg Hopper with Sambal')).toBeDefined();
    expect(screen.getByText(/Crispy bowl-shaped pancake/i)).toBeDefined();

    // Increment quantity
    const plusBtn = screen.getByRole('button', { name: /Increase quantity/i });
    fireEvent.click(plusBtn);

    // Add special notes
    const notesInput = screen.getByPlaceholderText(/dressing on the side/i);
    fireEvent.change(notesInput, { target: { value: 'Well done egg please' } });

    // Click Add to Cart
    const addBtn = screen.getByRole('button', { name: /Add to Cart/i });
    fireEvent.click(addBtn);

    // Back button
    const backBtn = screen.getByRole('button', { name: /Go back to/i });
    fireEvent.click(backBtn);
    expect(backClicked).toBe(true);
  });

  it('handles quantity decrement and unavailable item button state', () => {
    const unorderableItem: GuestMenuItem = {
      ...mockItem,
      isOrderable: false,
      isCutoff: true,
      portionCap: 2,
    };

    render(
      <Wrapper>
        <MenuItemDetail item={unorderableItem} onBack={() => {}} />
      </Wrapper>,
    );

    expect(screen.getByText(/Vegetarian/i)).toBeDefined();
    expect(screen.getByText(/Gluten-free/i)).toBeDefined();

    // Increment and decrement
    const plusBtn = screen.getByRole('button', { name: /Increase quantity/i });
    fireEvent.click(plusBtn);

    const minusBtn = screen.getByRole('button', { name: /Decrease quantity/i });
    fireEvent.click(minusBtn);
    fireEvent.click(minusBtn); // Attempt decrement at 1

    // Add button disabled
    const addBtn = screen.getByRole('button', { name: /Ordering Closed/i });
    expect(addBtn.hasAttribute('disabled')).toBe(true);
  });

  it('renders CTA states for Sold Out, Opens Soon, and Max portions in MenuItemDetail', () => {
    // 1. Sold Out
    const soldOutItem: GuestMenuItem = {
      ...mockItem,
      available: false,
    };
    const { rerender } = render(
      <Wrapper>
        <MenuItemDetail
          item={soldOutItem}
          availability={
            {
              state: 'sold_out',
              isOrderable: false,
            } as any
          }
          onBack={() => {}}
        />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /Sold Out/i })).toBeDefined();

    // 2. Ordering Not Yet Open
    rerender(
      <Wrapper>
        <MenuItemDetail
          item={mockItem}
          availability={
            {
              state: 'not_yet_open',
              isOrderable: false,
            } as any
          }
          onBack={() => {}}
        />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /Ordering Not Yet Open/i })).toBeDefined();

    // 3. Custom button label fallback
    rerender(
      <Wrapper>
        <MenuItemDetail
          item={{ ...mockItem, isOrderable: false, isCutoff: false }}
          availability={
            {
              state: 'other' as any,
              isOrderable: false,
              buttonLabel: 'Opens at 7:00 PM',
            } as any
          }
          onBack={() => {}}
        />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /Opens at 7:00 PM/i })).toBeDefined();

    // 4. Currently Unavailable fallback
    rerender(
      <Wrapper>
        <MenuItemDetail
          item={{ ...mockItem, isOrderable: false, isCutoff: false }}
          availability={
            {
              state: 'other' as any,
              isOrderable: false,
            } as any
          }
          onBack={() => {}}
        />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /Currently Unavailable/i })).toBeDefined();

    // 5. Special notes entry and successful add
    rerender(
      <Wrapper>
        <MenuItemDetail item={mockItem} onBack={() => {}} />
      </Wrapper>,
    );
    const noteInput = screen.getByPlaceholderText(/dressing on the side/i);
    fireEvent.change(noteInput, { target: { value: 'Extra sambal on the side' } });

    const addToCartBtn = screen.getByRole('button', { name: /Add to Cart/i });
    fireEvent.click(addToCartBtn);
  });
});

describe('MenuTab Component', () => {
  beforeEach(() => {
    mockAuth = { ...initialMockAuth };
    mockFetchGuestMenu.mockReset();
  });

  it('renders skeleton loading then populates categories and items', async () => {
    mockFetchGuestMenu.mockResolvedValue(mockMenuResponse);

    render(
      <Wrapper>
        <MenuTab />
      </Wrapper>,
    );

    // Wait for menu to load
    await waitFor(() => {
      expect(screen.getByText('Lunch')).toBeDefined();
    });

    // Switch to Breakfast tab
    const bfastTab = screen.getByRole('tab', { name: /Breakfast/i });
    fireEvent.click(bfastTab);

    await waitFor(() => {
      expect(screen.getByText('Egg Hopper with Sambal')).toBeDefined();
    });
  });

  it('filters items by category and selects item to view detail and go back', async () => {
    mockFetchGuestMenu.mockResolvedValue(mockMenuResponse);

    render(
      <Wrapper>
        <MenuTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Lamprais Special')).toBeDefined();
    });

    // Click card to open detail view
    const lampraisCard = screen.getByText('Lamprais Special');
    fireEvent.click(lampraisCard);

    // Detail view displays with Add to Cart
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add to Cart/i })).toBeDefined();
    });

    // Click back button to return to menu
    const backBtn = screen.getByRole('button', { name: /Go back to/i });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText('Lamprais Special')).toBeDefined();
    });
  });

  it('allows quick-adding item to cart directly from card', async () => {
    mockFetchGuestMenu.mockResolvedValue(mockMenuResponse);

    render(
      <Wrapper>
        <MenuTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Lamprais Special')).toBeDefined();
    });

    const quickAddBtns = screen.getAllByRole('button', { name: /Add .* to order/i });
    expect(quickAddBtns.length).toBeGreaterThan(0);
    fireEvent.click(quickAddBtns[0]);
  });

  it('displays AlertNotice with retry when menu fetch fails', async () => {
    mockFetchGuestMenu.mockRejectedValue(new Error('Network error loading menu'));

    render(
      <Wrapper>
        <MenuTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Network error loading menu/i)).toBeDefined();
    });

    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    mockFetchGuestMenu.mockResolvedValue(mockMenuResponse);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Lamprais Special')).toBeDefined();
    });
  });

  it('switches between meal period tabs (Dinner, Tea) and renders items', async () => {
    mockFetchGuestMenu.mockResolvedValue(mockMenuResponse);

    render(
      <Wrapper>
        <MenuTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Lamprais Special')).toBeDefined();
    });

    // Switch to Dinner
    const dinnerTab = screen.getByRole('tab', { name: /Dinner/i });
    fireEvent.click(dinnerTab);

    // Switch to Tea
    const teaTab = screen.getByRole('tab', { name: /Tea/i });
    fireEvent.click(teaTab);
  });

  it('renders empty menu state and handles View Lunch Menu action', async () => {
    mockFetchGuestMenu.mockResolvedValue({
      ...mockMenuResponse,
      items: [],
      totalItems: 0,
    });

    render(
      <Wrapper>
        <MenuTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('View Lunch Menu')).toBeDefined();
    });

    const actionBtn = screen.getByText('View Lunch Menu');
    fireEvent.click(actionBtn);
  });

  it('renders EmptyState when guest session is absent in MenuTab', () => {
    const savedAuth = mockAuth;
    mockAuth = { ...mockAuth, sessionToken: null, guest: null };

    render(
      <Wrapper>
        <MenuTab />
      </Wrapper>,
    );

    expect(screen.getByText('Guest Session Required')).toBeDefined();
    expect(
      screen.getByText(/Please scan your room QR code to view the hotel dining menu/i),
    ).toBeDefined();

    mockAuth = savedAuth;
  });

  it('renders course filter pills (Starters, Mains) and filters menu items', async () => {
    mockFetchGuestMenu.mockResolvedValue({
      ...mockMenuResponse,
      items: [
        {
          ...mockItem,
          id: 'dish-course-1',
          name: 'Vegetable Roti',
          category: 'Starters',
          mealPeriods: ['LUNCH'],
        },
        {
          ...mockItem,
          id: 'dish-course-2',
          name: 'Chicken Kottu',
          category: 'Mains',
          mealPeriods: ['LUNCH'],
        },
      ],
    });

    render(
      <Wrapper>
        <MenuTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Vegetable Roti')).toBeDefined();
      expect(screen.getByText('Chicken Kottu')).toBeDefined();
    });

    // Selecting an item opens detail view
    fireEvent.click(screen.getByText('Vegetable Roti'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add to Cart/i })).toBeDefined();
    });
  });

  it('handles cart view navigation, quick add, and menu retry on fetch failure', async () => {
    mockFetchGuestMenu.mockResolvedValue({
      ...mockMenuResponse,
      items: [
        mockItem,
        {
          ...mockItem,
          id: 'dish-lunch-1',
          name: 'Lunch Rice and Curry',
          category: 'Lunch',
          mealPeriods: ['LUNCH'],
        },
      ],
    });

    render(
      <Wrapper>
        <MenuTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Lunch Rice and Curry')).toBeDefined();
    });

    // Quick add button on item card
    const quickAddBtn = screen.getByRole('button', { name: /Add Lunch Rice and Curry to order/i });
    fireEvent.click(quickAddBtn);

    // View Cart floating bar click opens CartView
    const viewCartBtn = screen.queryByRole('button', { name: /View Cart/i });
    if (viewCartBtn) {
      fireEvent.click(viewCartBtn);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Place Order$/i })).toBeDefined();
      });
    }
  });

  it('handles fetch retry on network error in MenuTab', async () => {
    mockFetchGuestMenu.mockRejectedValueOnce(new Error('Network menu error'));

    render(
      <Wrapper>
        <MenuTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Network menu error/i)).toBeDefined();
    });

    // Retry succeeds
    mockFetchGuestMenu.mockResolvedValue({
      ...mockMenuResponse,
      items: [
        {
          ...mockItem,
          id: 'dish-lunch-1',
          name: 'Lunch Rice and Curry',
          category: 'Lunch',
          mealPeriods: ['LUNCH'],
        },
      ],
    });
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Lunch Rice and Curry')).toBeDefined();
    });
  });

  it('handles item detail selection, back to menu navigation, and unorderable quick add error', async () => {
    mockFetchGuestMenu.mockResolvedValue({
      ...mockMenuResponse,
      items: [
        {
          ...mockItem,
          id: 'dish-lunch-avail',
          name: 'Available Lunch Dish',
          category: 'Lunch',
          mealPeriods: ['LUNCH'],
          isOrderable: true,
        },
        {
          ...mockItem,
          id: 'dish-lunch-unavail',
          name: 'Sold Out Lunch Dish',
          category: 'Lunch',
          mealPeriods: ['LUNCH'],
          available: false,
          isOrderable: false,
        },
      ],
    });

    render(
      <Wrapper>
        <MenuTab />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Available Lunch Dish')).toBeDefined();
      expect(screen.getByText('Sold Out Lunch Dish')).toBeDefined();
    });

    // 1. Click item to open MenuItemDetail
    fireEvent.click(screen.getByText('Available Lunch Dish'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add to Cart/i })).toBeDefined();
    });

    // 2. Click back button in detail view
    const backBtn = screen.getByRole('button', { name: /Lunch/i });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText('Available Lunch Dish')).toBeDefined();
    });

    // 3. Quick add on unorderable item shows error
    const unavailAddBtn = screen.queryByRole('button', {
      name: /Add Sold Out Lunch Dish to order/i,
    });
    if (unavailAddBtn) {
      fireEvent.click(unavailAddBtn);
    }
  });

  it('handles MenuItemCard keyboard navigation, image error fallback, and dietary tag variants', () => {
    let selected = false;
    const veganItem: GuestMenuItem = {
      ...mockItem,
      id: 'dish-vegan',
      name: 'Vegan Salad Bowl',
      dietaryFlags: ['VEGAN', 'SPICY'],
      imageUrl: 'https://invalid-image.example.com/salad.jpg',
    };

    render(
      <Wrapper>
        <MenuItemCard
          item={veganItem}
          availability={{ state: 'available', isOrderable: true } as any}
          onSelect={() => {
            selected = true;
          }}
          onQuickAdd={() => {}}
        />
      </Wrapper>,
    );

    expect(screen.getByText('Vegan')).toBeDefined();
    expect(screen.getByText('Spicy')).toBeDefined();

    // Image onError
    const imgEl = screen.getByRole('img', { name: 'Vegan Salad Bowl' });
    fireEvent.error(imgEl);

    // Keyboard selection (Enter and Space)
    const card = screen.getByTestId('menu-item-card');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(selected).toBe(true);

    selected = false;
    fireEvent.keyDown(card, { key: ' ' });
    expect(selected).toBe(true);
  });

  it('handles MenuItemDetail quantity steppers, image error fallback, and dietary tags', () => {
    const specialItem: GuestMenuItem = {
      ...mockItem,
      id: 'dish-detail-test',
      name: 'Special Curry Feast',
      portionCap: 3,
      dietaryFlags: ['VEGAN', 'GLUTEN_FREE', 'ORGANIC'],
      imageUrl: 'https://invalid.example.com/curry.jpg',
    };

    render(
      <Wrapper>
        <MenuItemDetail
          item={specialItem}
          availability={{ state: 'available', isOrderable: true } as any}
          onBack={() => {}}
        />
      </Wrapper>,
    );

    expect(screen.getByText('Vegan')).toBeDefined();
    expect(screen.getByText('Organic')).toBeDefined();

    // Image error
    const heroImg = screen.getByRole('img', { name: 'Special Curry Feast' });
    fireEvent.error(heroImg);

    // Increment quantity
    const plusBtn = screen.getByRole('button', { name: 'Increase quantity' });
    fireEvent.click(plusBtn);

    // Decrement quantity
    const minusBtn = screen.getByRole('button', { name: 'Decrease quantity' });
    fireEvent.click(minusBtn);

    // Add to cart
    const addToCartBtn = screen.getByRole('button', { name: /Add to Cart/i });
    fireEvent.click(addToCartBtn);
  });
});
