import type {
  FoodOrderResponse,
  FoodOrderStatus,
  CreateFoodOrderPayload,
} from '../../../types/orders.ts';
import type { GuestMenuResponse, GuestMenuItem, MealWindowStatus } from '../../../types/menu.ts';
import type {
  ServiceRequestResponse,
  CreateServiceRequestPayload,
  ServiceRequestStatus,
} from '../../../types/services.ts';
import type {
  ComplaintResponse,
  CreateComplaintPayload,
  ComplaintStatus,
} from '../../../types/complaints.ts';
import { ApiError } from '../api-error.ts';
import type { FossRealtimeEvent } from '../../realtime/realtime-client.ts';
import { calculateLineTotal, roundMoney } from '../../utils/money.ts';
import { MIN_ORDER_ITEM_QUANTITY, MAX_ORDER_ITEM_QUANTITY } from '../../constants/order-policy.ts';

export interface DemoStay {
  roomNumber: string;
  bookingId: string;
  guestName: string;
  sessionToken: string;
  qrToken: string;
  shortCode: string;
  checkIn: string;
  checkOut: string;
  isExpired?: boolean;
}

/**
 * Deterministic Scenario Clock Strategy
 * Controls scenario time for testing stay validity, cancellation cutoffs, and meal periods.
 */
export class DemoScenarioClock {
  private static mockTimeMs: number | null = null;

  public static now(): Date {
    return this.mockTimeMs !== null ? new Date(this.mockTimeMs) : new Date();
  }

  public static setTime(dateOrMs: Date | number | string): void {
    this.mockTimeMs = new Date(dateOrMs).getTime();
  }

  public static advance(ms: number): void {
    const current = this.now().getTime();
    this.mockTimeMs = current + ms;
  }

  public static isOverridden(): boolean {
    return this.mockTimeMs !== null;
  }

  public static reset(): void {
    this.mockTimeMs = null;
  }

  public static generateStays(baseDate: Date = DemoScenarioClock.now()): DemoStay[] {
    const msInDay = 86400000;
    const nowMs = baseDate.getTime();

    return [
      {
        roomNumber: '101',
        bookingId: 'booking-101',
        guestName: 'John Doe',
        sessionToken: 'demo-token-room-101',
        qrToken: 'act-demo-101',
        shortCode: '101',
        checkIn: new Date(nowMs - 2 * msInDay).toISOString(),
        checkOut: new Date(nowMs + 4 * msInDay).toISOString(),
        isExpired: false,
      },
      {
        roomNumber: '102',
        bookingId: 'booking-102',
        guestName: 'Jane Smith',
        sessionToken: 'demo-token-room-102',
        qrToken: 'act-demo-102',
        shortCode: '102',
        checkIn: new Date(nowMs - 1 * msInDay).toISOString(),
        checkOut: new Date(nowMs + 3 * msInDay).toISOString(),
        isExpired: false,
      },
      {
        roomNumber: '103',
        bookingId: 'booking-103',
        guestName: 'Robert Frost',
        sessionToken: 'demo-token-room-103',
        qrToken: 'act-demo-103',
        shortCode: '103',
        checkIn: new Date(nowMs - 12 * 3600000).toISOString(),
        checkOut: new Date(nowMs + 5 * msInDay).toISOString(),
        isExpired: false,
      },
      {
        roomNumber: '204',
        bookingId: 'booking-204',
        guestName: 'Alice Wong',
        sessionToken: 'demo-token-room-204',
        qrToken: 'act-demo-204',
        shortCode: '204',
        checkIn: new Date(nowMs - 6 * 3600000).toISOString(),
        checkOut: new Date(nowMs + 2 * msInDay).toISOString(),
        isExpired: false,
      },
      {
        roomNumber: '999',
        bookingId: 'booking-expired',
        guestName: 'Expired Session',
        sessionToken: 'demo-token-expired',
        qrToken: 'act-demo-expired',
        shortCode: '999',
        checkIn: new Date(nowMs - 7 * msInDay).toISOString(),
        checkOut: new Date(nowMs - 1 * msInDay).toISOString(),
        isExpired: true,
      },
    ];
  }
}

export let DEMO_STAYS: DemoStay[] = DemoScenarioClock.generateStays();

export const DEMO_MENU_ITEMS: GuestMenuItem[] = [
  // --- STARTERS ---
  {
    id: 'menu-item-001',
    name: 'Truffle Mushroom Arancini',
    description: 'Crispy risotto spheres infused with black truffle and mozzarella core',
    price: 1800,
    category: 'Starters',
    mealPeriods: ['LUNCH', 'DINNER', 'ALL_DAY'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 7200,
    estimatedPrepMinutes: 15,
    imageUrl: 'https://cdn.foreverhotel.com/menu/arancini.webp',
    dietaryFlags: ['VEGETARIAN'],
    allergens: ['Dairy', 'Gluten'],
    portionCap: 3,
  },
  {
    id: 'menu-item-002',
    name: 'Vegetable Spring Rolls',
    description: 'Crisp pastry rolls packed with julienned vegetables and sweet chili dip',
    price: 1200,
    category: 'Starters',
    mealPeriods: ['LUNCH', 'DINNER', 'ALL_DAY'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 7200,
    estimatedPrepMinutes: 12,
    imageUrl: 'https://cdn.foreverhotel.com/menu/spring-rolls.webp',
    dietaryFlags: ['VEGETARIAN', 'VEGAN'],
    allergens: ['Gluten'],
    portionCap: 4,
  },

  // --- MAINS ---
  {
    id: 'menu-item-003',
    name: 'Ceylon Chicken Curry & Fragrant Rice',
    description:
      'Slow-cooked spiced chicken in coconut gravy served with samba rice and pol sambol',
    price: 2400,
    category: 'Mains',
    mealPeriods: ['LUNCH', 'DINNER'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 7200,
    estimatedPrepMinutes: 20,
    imageUrl: 'https://cdn.foreverhotel.com/menu/chicken-curry.webp',
    dietaryFlags: ['HALAL'],
    allergens: [],
    portionCap: 3,
  },
  {
    id: 'menu-item-004',
    name: 'Signature Wagyu Burger',
    description: 'Flame-grilled wagyu patty with aged cheddar, brioche bun, and truffle fries',
    price: 3600,
    category: 'Mains',
    mealPeriods: ['LUNCH', 'DINNER', 'ALL_DAY'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 7200,
    estimatedPrepMinutes: 20,
    imageUrl: 'https://cdn.foreverhotel.com/menu/wagyu-burger.webp',
    dietaryFlags: [],
    allergens: ['Dairy', 'Gluten'],
    portionCap: 3,
  },
  {
    id: 'menu-item-005',
    name: 'Devilled Prawn Noodles',
    description: 'Stir-fried noodles with jumbo lagoon prawns in spicy tomato-chili reduction',
    price: 2800,
    category: 'Mains',
    mealPeriods: ['LUNCH', 'DINNER'],
    available: false, // Out of Stock!
    isOrderable: false,
    isCutoff: false,
    secondsRemainingUntilCutoff: 7200,
    estimatedPrepMinutes: 25,
    imageUrl: 'https://cdn.foreverhotel.com/menu/prawn-noodles.webp',
    dietaryFlags: [],
    allergens: ['Crustaceans', 'Gluten'],
    portionCap: 2,
  },
  {
    id: 'menu-item-006',
    name: 'Classic Eggs Benedict',
    description: 'Poached free-range eggs on toasted brioche with smoked ham and hollandaise',
    price: 2100,
    category: 'Mains',
    mealPeriods: ['BREAKFAST'],
    available: true,
    isOrderable: false, // Cutoff Enforced during Lunch/Dinner!
    isCutoff: true,
    secondsRemainingUntilCutoff: 0,
    estimatedPrepMinutes: 15,
    imageUrl: 'https://cdn.foreverhotel.com/menu/eggs-benedict.webp',
    dietaryFlags: [],
    allergens: ['Egg', 'Dairy', 'Gluten'],
    portionCap: 3,
  },
  {
    id: 'menu-item-007',
    name: 'Sri Lankan Egg Roti & Dhal Curry',
    description: 'Fresh flatbread folded with spiced farm egg, served with creamy red lentil curry',
    price: 1400,
    category: 'Mains',
    mealPeriods: ['BREAKFAST', 'ALL_DAY'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 10800,
    estimatedPrepMinutes: 15,
    imageUrl: 'https://cdn.foreverhotel.com/menu/egg-roti.webp',
    dietaryFlags: ['VEGETARIAN'],
    allergens: ['Egg', 'Gluten'],
    portionCap: 3,
  },

  // --- DESSERTS ---
  {
    id: 'menu-item-008',
    name: 'Traditional Watalappan',
    description: 'Steamed jaggery coconut custard infused with cardamom, nutmeg, and cashew nuts',
    price: 1100,
    category: 'Desserts',
    mealPeriods: ['LUNCH', 'DINNER', 'TEA_TIME', 'ALL_DAY'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 7200,
    estimatedPrepMinutes: 10,
    imageUrl: 'https://cdn.foreverhotel.com/menu/watalappan.webp',
    dietaryFlags: ['VEGETARIAN', 'GLUTEN_FREE'],
    allergens: ['Egg', 'Tree Nuts'],
    portionCap: 4,
  },
  {
    id: 'menu-item-009',
    name: 'Tropical Fruit Platter',
    description: 'Chilled slices of papaya, pineapple, passion fruit, and watermelon with mint',
    price: 950,
    category: 'Desserts',
    mealPeriods: ['BREAKFAST', 'LUNCH', 'DINNER', 'ALL_DAY'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 10800,
    estimatedPrepMinutes: 8,
    imageUrl: 'https://cdn.foreverhotel.com/menu/fruit-platter.webp',
    dietaryFlags: ['VEGETARIAN', 'VEGAN', 'GLUTEN_FREE'],
    allergens: [],
    portionCap: 4,
  },

  // --- BEVERAGES & TEA ---
  {
    id: 'menu-item-010',
    name: 'Pure Ceylon Single-Estate Tea',
    description: 'Finest Nuwara Eliya pekoe served with warm milk and natural brown cane sugar',
    price: 750,
    category: 'Beverages',
    mealPeriods: ['BREAKFAST', 'LUNCH', 'DINNER', 'TEA_TIME', 'ALL_DAY'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 14400,
    estimatedPrepMinutes: 6,
    imageUrl: 'https://cdn.foreverhotel.com/menu/ceylon-tea.webp',
    dietaryFlags: ['VEGETARIAN', 'VEGAN', 'GLUTEN_FREE'],
    allergens: [],
    portionCap: 5,
  },
  {
    id: 'menu-item-011',
    name: 'Fresh Mint & Lime Soda',
    description: 'Freshly squeezed lime juice with garden mint, rock salt, and sparkling water',
    price: 850,
    category: 'Beverages',
    mealPeriods: ['LUNCH', 'DINNER', 'TEA_TIME', 'ALL_DAY'],
    available: true,
    isOrderable: true,
    isCutoff: false,
    secondsRemainingUntilCutoff: 14400,
    estimatedPrepMinutes: 5,
    imageUrl: 'https://cdn.foreverhotel.com/menu/lime-soda.webp',
    dietaryFlags: ['VEGAN', 'GLUTEN_FREE'],
    allergens: [],
    portionCap: 5,
  },
];

export const DEMO_MEAL_WINDOWS: MealWindowStatus[] = [
  {
    period: 'BREAKFAST',
    name: 'Breakfast',
    startTime: '06:30',
    cutoffTime: '10:30',
    isActive: false,
    isCutoffReached: true,
    secondsRemaining: 0,
  },
  {
    period: 'LUNCH',
    name: 'Lunch',
    startTime: '12:00',
    cutoffTime: '15:00',
    isActive: true,
    isCutoffReached: false,
    secondsRemaining: 7200,
  },
  {
    period: 'DINNER',
    name: 'Dinner',
    startTime: '19:00',
    cutoffTime: '22:30',
    isActive: false,
    isCutoffReached: false,
    secondsRemaining: 21600,
  },
  {
    period: 'ALL_DAY',
    name: 'All-Day Dining',
    startTime: '06:00',
    cutoffTime: '23:30',
    isActive: true,
    isCutoffReached: false,
    secondsRemaining: 36000,
  },
];

type RealtimeListener = (event: FossRealtimeEvent) => void;

/**
 * Deterministic In-Memory Demo State Store
 */
export class DemoStateStore {
  private static instance: DemoStateStore | null = null;

  private stays: DemoStay[] = DemoScenarioClock.generateStays();
  private orders: Map<string, FoodOrderResponse> = new Map();
  private serviceRequests: Map<string, ServiceRequestResponse> = new Map();
  private complaints: Map<string, ComplaintResponse> = new Map();
  private listeners: Set<RealtimeListener> = new Set();
  private eventCounter = 1;

  private constructor() {
    this.seedInitialFixtures();
  }

  public static getInstance(): DemoStateStore {
    if (!DemoStateStore.instance) {
      DemoStateStore.instance = new DemoStateStore();
    }
    return DemoStateStore.instance;
  }

  public getStays(): DemoStay[] {
    return this.stays;
  }

  public getDemoTokens(): Record<string, string> {
    const tokens: Record<string, string> = {};
    for (const stay of this.stays) {
      if (!stay.isExpired) {
        tokens[stay.roomNumber] = stay.qrToken;
      }
    }
    return tokens;
  }

  public setClockTime(time: Date | number | string): void {
    DemoScenarioClock.setTime(time);
    this.reset();
  }

  public resetClock(): void {
    DemoScenarioClock.reset();
    this.reset();
  }

  public reset(): void {
    DemoScenarioClock.reset();
    this.stays = DemoScenarioClock.generateStays();
    DEMO_STAYS = this.stays;
    this.orders.clear();
    this.serviceRequests.clear();
    this.complaints.clear();
    this.seedInitialFixtures();
  }

  public resetToInitial(): void {
    this.reset();
  }

  private seedInitialFixtures(): void {
    const now = DemoScenarioClock.now();

    // --- ROOM 101 FIXTURES ---
    const order101Delivered: FoodOrderResponse = {
      orderId: 'ORD-101-DELIV',
      roomNumber: '101',
      bookingId: 'booking-101',
      status: 'DELIVERED',
      totalAmount: 3150,
      items: [
        {
          itemId: 'menu-item-003',
          name: 'Ceylon Chicken Curry & Fragrant Rice',
          unitPrice: 2400,
          quantity: 1,
        },
        {
          itemId: 'menu-item-010',
          name: 'Pure Ceylon Single-Estate Tea',
          unitPrice: 750,
          quantity: 1,
        },
      ],
      estimatedDeliveryMinutes: 25,
      createdAt: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      idempotencyKey: 'idemp-demo-seed-101-deliv',
      canCancel: false,
      timeline: [
        { status: 'PLACED', label: 'Order Placed', completed: true, current: false },
        { status: 'IN_PREPARATION', label: 'Kitchen Preparing', completed: true, current: false },
        { status: 'READY', label: 'Ready for Service', completed: true, current: false },
        { status: 'DELIVERED', label: 'Delivered to Room', completed: true, current: true },
      ],
    };

    const order101Placed: FoodOrderResponse = {
      orderId: 'ORD-101-PLACED',
      roomNumber: '101',
      bookingId: 'booking-101',
      status: 'PLACED',
      totalAmount: 1800,
      items: [
        {
          itemId: 'menu-item-001',
          name: 'Truffle Mushroom Arancini',
          unitPrice: 1800,
          quantity: 1,
        },
      ],
      estimatedDeliveryMinutes: 20,
      createdAt: new Date(now.getTime() - 3 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 3 * 60 * 1000).toISOString(),
      idempotencyKey: 'idemp-demo-seed-101-placed',
      canCancel: true,
      cancellationCutoffTime: new Date(now.getTime() + 7 * 60 * 1000).toISOString(),
      secondsRemainingToCancel: 420,
      timeline: [
        { status: 'PLACED', label: 'Order Placed', completed: true, current: true },
        { status: 'IN_PREPARATION', label: 'Kitchen Preparing', completed: false, current: false },
        { status: 'READY', label: 'Ready for Service', completed: false, current: false },
        { status: 'DELIVERED', label: 'Delivered to Room', completed: false, current: false },
      ],
    };

    this.orders.set(order101Delivered.orderId, order101Delivered);
    this.orders.set(order101Placed.orderId, order101Placed);

    const req101Towel: ServiceRequestResponse = {
      requestId: 'REQ-101-TOWEL',
      roomNumber: '101',
      bookingId: 'booking-101',
      requestType: 'EXTRA_TOWELS',
      description: 'Please provide 2 fresh bath towels',
      status: 'ASSIGNED',
      priority: 'NORMAL',
      assignedStaff: 'Sunil (Housekeeping)',
      estimatedCompletionMinutes: 15,
      taskId: 'task-demo-101-towel',
      idempotencyKey: 'idemp-demo-seed-req-101',
      createdAt: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      timeline: [
        { status: 'SUBMITTED', label: 'Request Submitted', completed: true, current: false },
        { status: 'ASSIGNED', label: 'Worker Assigned', completed: true, current: true },
        { status: 'IN_PROGRESS', label: 'In Progress', completed: false, current: false },
        { status: 'COMPLETED', label: 'Completed', completed: false, current: false },
      ],
    };
    this.serviceRequests.set(req101Towel.requestId, req101Towel);

    const cmp101Food: ComplaintResponse = {
      complaintId: 'CMP-101-FOOD',
      roomNumber: '101',
      bookingId: 'booking-101',
      category: 'FOOD',
      severity: 'MEDIUM',
      subject: 'Curry temperature',
      description: 'The chicken curry arrived lukewarm',
      status: 'UNDER_INVESTIGATION',
      createdAt: new Date(now.getTime() - 40 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      timeline: [
        { status: 'SUBMITTED', label: 'Submitted', completed: true, current: false },
        {
          status: 'UNDER_INVESTIGATION',
          label: 'Under Investigation',
          completed: true,
          current: true,
        },
        { status: 'RESOLVED', label: 'Resolved', completed: false, current: false },
        { status: 'ESCALATED', label: 'Escalated', completed: false, current: false },
      ],
    };
    this.complaints.set(cmp101Food.complaintId, cmp101Food);

    // --- ROOM 102 FIXTURES ---
    const order102Prep: FoodOrderResponse = {
      orderId: 'ORD-102-PREP',
      roomNumber: '102',
      bookingId: 'booking-102',
      status: 'IN_PREPARATION',
      totalAmount: 3600,
      items: [
        {
          itemId: 'menu-item-004',
          name: 'Signature Wagyu Burger',
          unitPrice: 3600,
          quantity: 1,
        },
      ],
      estimatedDeliveryMinutes: 15,
      createdAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      idempotencyKey: 'idemp-demo-seed-102-prep',
      canCancel: false,
      timeline: [
        { status: 'PLACED', label: 'Order Placed', completed: true, current: false },
        { status: 'IN_PREPARATION', label: 'Kitchen Preparing', completed: true, current: true },
        { status: 'READY', label: 'Ready for Service', completed: false, current: false },
        { status: 'DELIVERED', label: 'Delivered to Room', completed: false, current: false },
      ],
    };
    this.orders.set(order102Prep.orderId, order102Prep);

    const req102Water: ServiceRequestResponse = {
      requestId: 'REQ-102-WATER',
      roomNumber: '102',
      bookingId: 'booking-102',
      requestType: 'WATER',
      description: '4 bottles of mineral water',
      status: 'SUBMITTED',
      priority: 'NORMAL',
      estimatedCompletionMinutes: 20,
      idempotencyKey: 'idemp-demo-seed-req-102',
      createdAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      timeline: [
        { status: 'SUBMITTED', label: 'Request Submitted', completed: true, current: true },
        { status: 'ASSIGNED', label: 'Worker Assigned', completed: false, current: false },
        { status: 'IN_PROGRESS', label: 'In Progress', completed: false, current: false },
        { status: 'COMPLETED', label: 'Completed', completed: false, current: false },
      ],
    };
    this.serviceRequests.set(req102Water.requestId, req102Water);
    // Room 102 has 0 complaints (empty list)

    // --- ROOM 103 FIXTURES ---
    // Room 103 has 0 orders (empty list)
    const req103Luggage: ServiceRequestResponse = {
      requestId: 'REQ-103-LUGGAGE',
      roomNumber: '103',
      bookingId: 'booking-103',
      requestType: 'LUGGAGE_ASSISTANCE',
      description: 'Help with luggage checkout at 11am',
      status: 'COMPLETED',
      priority: 'HIGH',
      assignedStaff: 'Priyanka (Concierge)',
      estimatedCompletionMinutes: 15,
      idempotencyKey: 'idemp-demo-seed-req-103',
      createdAt: new Date(now.getTime() - 120 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      timeline: [
        { status: 'SUBMITTED', label: 'Request Submitted', completed: true, current: false },
        { status: 'ASSIGNED', label: 'Worker Assigned', completed: true, current: false },
        { status: 'IN_PROGRESS', label: 'In Progress', completed: true, current: false },
        { status: 'COMPLETED', label: 'Completed', completed: true, current: true },
      ],
    };
    this.serviceRequests.set(req103Luggage.requestId, req103Luggage);

    const cmp103Noise: ComplaintResponse = {
      complaintId: 'CMP-103-NOISE',
      roomNumber: '103',
      bookingId: 'booking-103',
      category: 'NOISE',
      severity: 'HIGH',
      subject: 'Hallway commotion',
      description: 'Loud music from adjacent corridor at midnight',
      status: 'RESOLVED',
      resolutionNotes: 'Duty manager spoke with occupants and sound was ceased immediately.',
      createdAt: new Date(now.getTime() - 180 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      timeline: [
        { status: 'SUBMITTED', label: 'Submitted', completed: true, current: false },
        {
          status: 'UNDER_INVESTIGATION',
          label: 'Under Investigation',
          completed: true,
          current: false,
        },
        { status: 'RESOLVED', label: 'Resolved', completed: true, current: true },
        { status: 'ESCALATED', label: 'Escalated', completed: false, current: false },
      ],
    };
    this.complaints.set(cmp103Noise.complaintId, cmp103Noise);

    // --- ROOM 204: Completely empty stay (0 orders, 0 requests, 0 complaints) ---
  }

  // --- SESSION RESOLUTION ---
  public resolveStayByToken(sessionToken: string): DemoStay {
    if (!sessionToken || !sessionToken.startsWith('demo-token-')) {
      throw new ApiError('Real API tokens cannot be resolved in Demo Mode.', 401);
    }
    const stay = this.stays.find((s) => s.sessionToken === sessionToken);
    if (!stay) {
      throw new ApiError('Invalid or unauthenticated demo session token.', 401);
    }
    const isPastCheckout = new Date(stay.checkOut).getTime() <= DemoScenarioClock.now().getTime();
    if (stay.isExpired || isPastCheckout) {
      throw new ApiError('Demo session has expired.', 401);
    }
    return stay;
  }

  public resolveStayByQr(qrToken: string): DemoStay {
    const stay = this.stays.find(
      (s) => s.qrToken === qrToken || s.shortCode === qrToken || s.roomNumber === qrToken,
    );
    if (!stay) {
      throw new ApiError('Invalid or expired QR activation code.', 400);
    }
    const isPastCheckout = new Date(stay.checkOut).getTime() <= DemoScenarioClock.now().getTime();
    if (stay.isExpired || isPastCheckout) {
      throw new ApiError('Guest stay has already checked out or QR is expired.', 400);
    }
    return stay;
  }

  // --- ORDERS ---
  public getOrdersForStay(bookingId: string, roomNumber: string): FoodOrderResponse[] {
    const results: FoodOrderResponse[] = [];
    for (const order of this.orders.values()) {
      if (order.bookingId === bookingId && order.roomNumber === roomNumber) {
        results.push(JSON.parse(JSON.stringify(order)));
      }
    }
    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  public getOrderById(orderId: string, stay: DemoStay): FoodOrderResponse {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new ApiError(`Order [${orderId}] was not found.`, 404);
    }
    if (order.bookingId !== stay.bookingId || order.roomNumber !== stay.roomNumber) {
      throw new ApiError(
        'You do not have permission to view orders from another room or booking.',
        403,
      );
    }
    return JSON.parse(JSON.stringify(order));
  }

  public placeOrder(
    stay: DemoStay,
    payload: CreateFoodOrderPayload,
    idempotencyKey: string,
  ): FoodOrderResponse {
    // Check duplicate idempotency key
    for (const existing of this.orders.values()) {
      if (existing.idempotencyKey === idempotencyKey) {
        return JSON.parse(JSON.stringify(existing));
      }
    }

    const orderId = `ORD-DEMO-${Math.floor(100 + Math.random() * 900)}`;
    const now = DemoScenarioClock.now();
    const cancellationCutoff = new Date(now.getTime() + 600 * 1000);

    let totalAmount = 0;
    const validatedItems = (payload.items || []).map((item) => {
      if (item.quantity < MIN_ORDER_ITEM_QUANTITY || item.quantity > MAX_ORDER_ITEM_QUANTITY) {
        throw new ApiError(
          `Quantity for item [${item.menuItemId}] must be between ${MIN_ORDER_ITEM_QUANTITY} and ${MAX_ORDER_ITEM_QUANTITY}.`,
          400,
        );
      }
      const catalogItem = DEMO_MENU_ITEMS.find((m) => m.id === item.menuItemId);
      if (!catalogItem) {
        throw new ApiError(`Menu item [${item.menuItemId}] is not in catalog.`, 400);
      }
      if (!catalogItem.available) {
        throw new ApiError(`Item "${catalogItem.name}" is currently sold out.`, 409);
      }
      if (catalogItem.isCutoff) {
        throw new ApiError(`Ordering window for "${catalogItem.name}" has closed.`, 409);
      }
      const unitPrice = catalogItem.price;
      const lineTotal = calculateLineTotal(unitPrice, item.quantity);
      totalAmount = roundMoney(totalAmount + lineTotal);
      return {
        itemId: catalogItem.id,
        name: catalogItem.name,
        unitPrice,
        quantity: item.quantity,
        specialNotes: item.specialNotes,
      };
    });

    const newOrder: FoodOrderResponse = {
      orderId,
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      status: 'PLACED',
      totalAmount,
      items: validatedItems,
      allergyNotes: payload.allergyNote,
      estimatedDeliveryMinutes: 25,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      idempotencyKey,
      canCancel: true,
      cancellationCutoffTime: cancellationCutoff.toISOString(),
      secondsRemainingToCancel: 600,
      timeline: [
        {
          status: 'PLACED',
          label: 'Order Placed',
          completed: true,
          current: true,
          timestamp: now.toISOString(),
        },
        { status: 'IN_PREPARATION', label: 'Kitchen Preparing', completed: false, current: false },
        { status: 'READY', label: 'Ready for Service', completed: false, current: false },
        { status: 'DELIVERED', label: 'Delivered to Room', completed: false, current: false },
      ],
    };

    this.orders.set(orderId, newOrder);
    this.broadcastEvent({
      eventId: `evt-${this.eventCounter++}`,
      eventType: 'FOOD_ORDER_STATUS_UPDATED',
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      version: this.eventCounter,
      serverTimestamp: now.toISOString(),
      data: newOrder,
    });

    return JSON.parse(JSON.stringify(newOrder));
  }

  public cancelOrder(stay: DemoStay, orderId: string, _reason?: string): FoodOrderResponse {
    void _reason;
    const order = this.orders.get(orderId);
    if (!order) {
      throw new ApiError(`Order [${orderId}] was not found.`, 404);
    }
    if (order.bookingId !== stay.bookingId || order.roomNumber !== stay.roomNumber) {
      throw new ApiError(
        'You do not have permission to cancel orders from another room or booking.',
        403,
      );
    }
    if (order.status === 'CANCELLED') {
      throw new ApiError('Order has already been cancelled.', 409);
    }
    if (order.status === 'IN_PREPARATION' || order.status === 'READY') {
      throw new ApiError(
        'Order cannot be cancelled because kitchen preparation has already begun.',
        409,
      );
    }
    if (order.status === 'DELIVERED') {
      throw new ApiError('Order has already been delivered and cannot be cancelled.', 409);
    }

    const now = DemoScenarioClock.now();
    const cutoffTime = order.cancellationCutoffTime
      ? new Date(order.cancellationCutoffTime).getTime()
      : 0;
    if (cutoffTime > 0 && now.getTime() > cutoffTime) {
      throw new ApiError('Cancellation window has expired (10-minute limit exceeded).', 409);
    }

    order.status = 'CANCELLED';
    order.canCancel = false;
    order.updatedAt = now.toISOString();

    this.broadcastEvent({
      eventId: `evt-${this.eventCounter++}`,
      eventType: 'FOOD_ORDER_STATUS_UPDATED',
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      version: this.eventCounter,
      serverTimestamp: now.toISOString(),
      data: order,
    });

    return JSON.parse(JSON.stringify(order));
  }

  public advanceOrderStatus(
    stay: DemoStay,
    orderId: string,
    newStatus: FoodOrderStatus,
  ): FoodOrderResponse {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new ApiError(`Order [${orderId}] was not found.`, 404);
    }
    if (order.bookingId !== stay.bookingId || order.roomNumber !== stay.roomNumber) {
      throw new ApiError('Cross-room order advancement forbidden.', 403);
    }

    const now = DemoScenarioClock.now();
    order.status = newStatus;
    order.updatedAt = now.toISOString();
    order.canCancel = newStatus === 'PLACED';

    if (order.timeline) {
      const statuses: FoodOrderStatus[] = ['PLACED', 'IN_PREPARATION', 'READY', 'DELIVERED'];
      const targetIndex = statuses.indexOf(newStatus);
      order.timeline = order.timeline.map((step) => {
        const stepIndex = statuses.indexOf(step.status);
        return {
          ...step,
          completed: stepIndex <= targetIndex,
          current: stepIndex === targetIndex,
          timestamp: stepIndex <= targetIndex ? step.timestamp || now.toISOString() : undefined,
        };
      });
    }

    this.broadcastEvent({
      eventId: `evt-${this.eventCounter++}`,
      eventType: 'FOOD_ORDER_STATUS_UPDATED',
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      version: this.eventCounter,
      serverTimestamp: now.toISOString(),
      data: order,
    });

    return JSON.parse(JSON.stringify(order));
  }

  // --- SERVICE REQUESTS ---
  public getServiceRequestsForStay(
    bookingId: string,
    roomNumber: string,
  ): ServiceRequestResponse[] {
    const results: ServiceRequestResponse[] = [];
    for (const req of this.serviceRequests.values()) {
      if (req.bookingId === bookingId && req.roomNumber === roomNumber) {
        results.push(JSON.parse(JSON.stringify(req)));
      }
    }
    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  public getServiceRequestById(requestId: string, stay: DemoStay): ServiceRequestResponse {
    const req = this.serviceRequests.get(requestId);
    if (!req) {
      throw new ApiError(`Service request [${requestId}] was not found.`, 404);
    }
    if (req.bookingId !== stay.bookingId || req.roomNumber !== stay.roomNumber) {
      throw new ApiError(
        'You do not have permission to view service requests from another room or booking.',
        403,
      );
    }
    return JSON.parse(JSON.stringify(req));
  }

  public createServiceRequest(
    stay: DemoStay,
    payload: CreateServiceRequestPayload,
    idempotencyKey?: string,
  ): ServiceRequestResponse {
    const key = idempotencyKey || `idemp-demo-svc-${Date.now()}`;
    for (const existing of this.serviceRequests.values()) {
      if (existing.idempotencyKey === key) {
        return JSON.parse(JSON.stringify(existing));
      }
    }

    const requestId = `REQ-DEMO-${Math.floor(100 + Math.random() * 900)}`;
    const now = DemoScenarioClock.now();

    const newReq: ServiceRequestResponse = {
      requestId,
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      requestType: payload.requestType,
      description: payload.description || null,
      status: 'SUBMITTED',
      priority: payload.priority || 'NORMAL',
      estimatedCompletionMinutes: 20,
      idempotencyKey: key,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      timeline: [
        {
          status: 'SUBMITTED',
          label: 'Request Submitted',
          completed: true,
          current: true,
          timestamp: now.toISOString(),
        },
        { status: 'ASSIGNED', label: 'Worker Assigned', completed: false, current: false },
        { status: 'IN_PROGRESS', label: 'In Progress', completed: false, current: false },
        { status: 'COMPLETED', label: 'Completed', completed: false, current: false },
      ],
    };

    this.serviceRequests.set(requestId, newReq);
    this.broadcastEvent({
      eventId: `evt-${this.eventCounter++}`,
      eventType: 'SERVICE_REQUEST_STATUS_UPDATED',
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      version: this.eventCounter,
      serverTimestamp: now.toISOString(),
      data: newReq,
    });

    return JSON.parse(JSON.stringify(newReq));
  }

  public advanceServiceRequestStatus(
    stay: DemoStay,
    requestId: string,
    newStatus: ServiceRequestStatus,
    assignedStaff?: string,
  ): ServiceRequestResponse {
    const req = this.serviceRequests.get(requestId);
    if (!req) {
      throw new ApiError(`Service request [${requestId}] was not found.`, 404);
    }
    if (req.bookingId !== stay.bookingId || req.roomNumber !== stay.roomNumber) {
      throw new ApiError('Cross-room service request advancement forbidden.', 403);
    }

    const now = DemoScenarioClock.now();
    req.status = newStatus;
    req.updatedAt = now.toISOString();
    if (assignedStaff) {
      req.assignedStaff = assignedStaff;
    }

    if (req.timeline) {
      const statuses: ServiceRequestStatus[] = [
        'SUBMITTED',
        'ASSIGNED',
        'IN_PROGRESS',
        'COMPLETED',
      ];
      const targetIndex = statuses.indexOf(newStatus);
      req.timeline = req.timeline.map((step) => {
        const stepIndex = statuses.indexOf(step.status);
        return {
          ...step,
          completed: stepIndex <= targetIndex,
          current: stepIndex === targetIndex,
          timestamp: stepIndex <= targetIndex ? step.timestamp || now.toISOString() : undefined,
        };
      });
    }

    this.broadcastEvent({
      eventId: `evt-${this.eventCounter++}`,
      eventType: 'SERVICE_REQUEST_STATUS_UPDATED',
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      version: this.eventCounter,
      serverTimestamp: now.toISOString(),
      data: req,
    });

    return JSON.parse(JSON.stringify(req));
  }

  // --- COMPLAINTS ---
  public getComplaintsForStay(bookingId: string, roomNumber: string): ComplaintResponse[] {
    const results: ComplaintResponse[] = [];
    for (const cmp of this.complaints.values()) {
      if (cmp.bookingId === bookingId && cmp.roomNumber === roomNumber) {
        results.push(JSON.parse(JSON.stringify(cmp)));
      }
    }
    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  public getComplaintById(complaintId: string, stay: DemoStay): ComplaintResponse {
    const cmp = this.complaints.get(complaintId);
    if (!cmp) {
      throw new ApiError(`Complaint [${complaintId}] was not found.`, 404);
    }
    if (cmp.bookingId !== stay.bookingId || cmp.roomNumber !== stay.roomNumber) {
      throw new ApiError(
        'You do not have permission to view complaints from another room or booking.',
        403,
      );
    }
    return JSON.parse(JSON.stringify(cmp));
  }

  public createComplaint(stay: DemoStay, payload: CreateComplaintPayload): ComplaintResponse {
    if (payload.relatedOrderId) {
      const ord = this.orders.get(payload.relatedOrderId);
      if (!ord || ord.bookingId !== stay.bookingId || ord.roomNumber !== stay.roomNumber) {
        throw new ApiError(
          `Referenced food order [${payload.relatedOrderId}] does not belong to the current guest stay.`,
          400,
        );
      }
    }
    if (payload.relatedRequestId) {
      const req = this.serviceRequests.get(payload.relatedRequestId);
      if (!req || req.bookingId !== stay.bookingId || req.roomNumber !== stay.roomNumber) {
        throw new ApiError(
          `Referenced service request [${payload.relatedRequestId}] does not belong to the current guest stay.`,
          400,
        );
      }
    }

    const complaintId = `CMP-DEMO-${Math.floor(100 + Math.random() * 900)}`;
    const now = DemoScenarioClock.now();

    const newCmp: ComplaintResponse = {
      complaintId,
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      category: payload.category,
      severity: payload.severity || 'LOW',
      subject: payload.subject,
      description: payload.description,
      status: 'SUBMITTED',
      relatedOrderId: payload.relatedOrderId || null,
      relatedRequestId: payload.relatedRequestId || null,
      assignedManager: null,
      resolutionNotes: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      timeline: [
        {
          status: 'SUBMITTED',
          label: 'Submitted',
          completed: true,
          current: true,
          timestamp: now.toISOString(),
        },
        {
          status: 'UNDER_INVESTIGATION',
          label: 'Under Investigation',
          completed: false,
          current: false,
        },
        { status: 'RESOLVED', label: 'Resolved', completed: false, current: false },
        { status: 'ESCALATED', label: 'Escalated', completed: false, current: false },
      ],
    };

    this.complaints.set(complaintId, newCmp);
    this.broadcastEvent({
      eventId: `evt-${this.eventCounter++}`,
      eventType: 'COMPLAINT_STATUS_UPDATED',
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      version: this.eventCounter,
      serverTimestamp: now.toISOString(),
      data: newCmp,
    });

    return JSON.parse(JSON.stringify(newCmp));
  }

  public advanceComplaintStatus(
    stay: DemoStay,
    complaintId: string,
    newStatus: ComplaintStatus,
    resolutionNotes?: string,
  ): ComplaintResponse {
    const cmp = this.complaints.get(complaintId);
    if (!cmp) {
      throw new ApiError(`Complaint [${complaintId}] was not found.`, 404);
    }
    if (cmp.bookingId !== stay.bookingId || cmp.roomNumber !== stay.roomNumber) {
      throw new ApiError('Cross-room complaint advancement forbidden.', 403);
    }

    const now = DemoScenarioClock.now();
    cmp.status = newStatus;
    cmp.updatedAt = now.toISOString();
    if (resolutionNotes) {
      cmp.resolutionNotes = resolutionNotes;
    }

    if (cmp.timeline) {
      const statuses: ComplaintStatus[] = [
        'SUBMITTED',
        'UNDER_INVESTIGATION',
        'RESOLVED',
        'ESCALATED',
      ];
      const targetIndex = statuses.indexOf(newStatus);
      cmp.timeline = cmp.timeline.map((step) => {
        const stepIndex = statuses.indexOf(step.status);
        return {
          ...step,
          completed: stepIndex <= targetIndex,
          current: stepIndex === targetIndex,
          timestamp: stepIndex <= targetIndex ? step.timestamp || now.toISOString() : undefined,
        };
      });
    }

    this.broadcastEvent({
      eventId: `evt-${this.eventCounter++}`,
      eventType: 'COMPLAINT_STATUS_UPDATED',
      roomNumber: stay.roomNumber,
      bookingId: stay.bookingId,
      version: this.eventCounter,
      serverTimestamp: now.toISOString(),
      data: cmp,
    });

    return JSON.parse(JSON.stringify(cmp));
  }

  // --- MENU ---
  public getMenuCatalog(): GuestMenuResponse {
    return {
      currentTimeInColombo: DemoScenarioClock.now().toISOString(),
      activeMealPeriods: ['LUNCH', 'ALL_DAY'],
      categories: ['Starters', 'Mains', 'Desserts', 'Beverages'],
      mealWindows: JSON.parse(JSON.stringify(DEMO_MEAL_WINDOWS)),
      items: JSON.parse(JSON.stringify(DEMO_MENU_ITEMS)),
      totalItems: DEMO_MENU_ITEMS.length,
      version: '1.0.0-demo',
    };
  }

  public getMenuItemById(itemId: string): GuestMenuItem | null {
    const item = DEMO_MENU_ITEMS.find((m) => m.id === itemId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  // --- REALTIME LISTENER DISPATCH ---
  public addRealtimeListener(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private broadcastEvent(event: FossRealtimeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Safe dispatch isolation
      }
    }
  }
}

export const demoStateStore = DemoStateStore.getInstance();
