import { FoodOrderStatus } from '../../../../modules/food-orders/enums/food-order-status.enum.js';
import { ContractVersion } from '../../../contracts/contract-version.enum.js';
import { KmsMenuCatalogDto, MealPeriod } from '../dto/kms-menu.dto.js';
import { KmsCreateOrderDto } from '../dto/kms-order.dto.js';
import { KmsOrderResultDto } from '../dto/kms-order-result.dto.js';

export const KMS_FIXTURE_CATALOG_V1: KmsMenuCatalogDto = {
  version: ContractVersion.V1_0,
  generatedAt: '2026-10-28T06:00:00.000Z',
  categories: ['Starters', 'Mains', 'Desserts', 'Beverages'],
  items: [
    {
      id: 'menu-item-001',
      name: 'Truffle Mushroom Arancini',
      description:
        'Crispy risotto spheres infused with black truffle and mozzarella core',
      price: 18.0,
      category: 'Starters',
      mealPeriods: [MealPeriod.LUNCH, MealPeriod.DINNER, MealPeriod.ALL_DAY],
      available: true,
      estimatedPrepMinutes: 15,
      imageUrl: 'https://cdn.foreverhotel.com/menu/arancini.webp',
      dietaryFlags: ['VEGETARIAN'],
      allergens: ['Dairy', 'Gluten'],
    },
    {
      id: 'menu-item-002',
      name: 'Signature Wagyu Burger',
      description:
        'Flame-grilled wagyu patty with aged cheddar, brioche bun, and truffle fries',
      price: 32.5,
      category: 'Mains',
      mealPeriods: [MealPeriod.LUNCH, MealPeriod.DINNER, MealPeriod.ALL_DAY],
      available: true,
      estimatedPrepMinutes: 20,
      imageUrl: 'https://cdn.foreverhotel.com/menu/wagyu-burger.webp',
      dietaryFlags: [],
      allergens: ['Dairy', 'Gluten'],
    },
    {
      id: 'menu-item-003',
      name: 'Wild Atlantic Salmon',
      description:
        'Pan-seared salmon fillet over saffron cauliflower puree and asparagus',
      price: 36.0,
      category: 'Mains',
      mealPeriods: [MealPeriod.DINNER],
      available: true,
      estimatedPrepMinutes: 25,
      imageUrl: 'https://cdn.foreverhotel.com/menu/salmon.webp',
      dietaryFlags: ['GLUTEN_FREE'],
      allergens: ['Fish'],
    },
    {
      id: 'menu-item-004',
      name: 'Classic Eggs Benedict',
      description:
        'Poached free-range eggs on toasted brioche with smoked ham and hollandaise',
      price: 22.0,
      category: 'Mains',
      mealPeriods: [MealPeriod.BREAKFAST],
      available: true,
      estimatedPrepMinutes: 15,
      imageUrl: 'https://cdn.foreverhotel.com/menu/eggs-benedict.webp',
      dietaryFlags: [],
      allergens: ['Eggs', 'Dairy', 'Gluten'],
    },
    {
      id: 'menu-item-005',
      name: 'Artisan Vanilla Bean Panna Cotta',
      description:
        'Velvety cream dessert paired with passion fruit coulis and fresh berries',
      price: 14.0,
      category: 'Desserts',
      mealPeriods: [MealPeriod.LUNCH, MealPeriod.DINNER, MealPeriod.ALL_DAY],
      available: true,
      estimatedPrepMinutes: 10,
      imageUrl: 'https://cdn.foreverhotel.com/menu/panna-cotta.webp',
      dietaryFlags: ['VEGETARIAN', 'GLUTEN_FREE'],
      allergens: ['Dairy'],
    },
    {
      id: 'menu-item-006',
      name: 'Freshly Squeezed Valencia Orange Juice',
      description: 'Pure cold-pressed orange juice served chilled',
      price: 8.5,
      category: 'Beverages',
      mealPeriods: [
        MealPeriod.BREAKFAST,
        MealPeriod.LUNCH,
        MealPeriod.DINNER,
        MealPeriod.ALL_DAY,
      ],
      available: true,
      estimatedPrepMinutes: 5,
      imageUrl: 'https://cdn.foreverhotel.com/menu/orange-juice.webp',
      dietaryFlags: ['VEGAN', 'GLUTEN_FREE'],
      allergens: [],
    },
    {
      id: 'menu-item-007',
      name: 'Seasonal Lobster Tail (Sold Out)',
      description:
        'Butter-poached Maine lobster tail with garlic herb emulsion',
      price: 48.0,
      category: 'Mains',
      mealPeriods: [MealPeriod.DINNER],
      available: false,
      estimatedPrepMinutes: 30,
      imageUrl: 'https://cdn.foreverhotel.com/menu/lobster.webp',
      dietaryFlags: ['GLUTEN_FREE'],
      allergens: ['Crustaceans', 'Dairy'],
    },
  ],
};

export const KMS_FIXTURE_CREATE_ORDER_VALID: KmsCreateOrderDto = {
  orderId: 'order-fixture-001',
  roomNumber: '101',
  bookingId: 'booking-101',
  items: [
    {
      itemId: 'menu-item-002',
      name: 'Signature Wagyu Burger',
      unitPrice: 32.5,
      quantity: 2,
      specialNotes: 'One with cheddar melted, one with no pickles',
    },
    {
      itemId: 'menu-item-006',
      name: 'Freshly Squeezed Valencia Orange Juice',
      unitPrice: 8.5,
      quantity: 1,
    },
  ],
  totalAmount: 73.5,
  allergyNotes: 'No peanuts',
  idempotencyKey: 'idemp-kms-fixture-001',
  version: ContractVersion.V1_0,
};

export const KMS_FIXTURE_ORDER_PLACED: KmsOrderResultDto = {
  orderId: 'order-fixture-001',
  roomNumber: '101',
  bookingId: 'booking-101',
  status: FoodOrderStatus.PLACED,
  totalAmount: 73.5,
  items: KMS_FIXTURE_CREATE_ORDER_VALID.items,
  allergyNotes: 'No peanuts',
  estimatedDeliveryMinutes: 25,
  createdAt: '2026-10-28T12:00:00.000Z',
  updatedAt: '2026-10-28T12:00:00.000Z',
  version: ContractVersion.V1_0,
};

export const KMS_FIXTURE_ORDER_IN_PREPARATION: KmsOrderResultDto = {
  ...KMS_FIXTURE_ORDER_PLACED,
  status: FoodOrderStatus.IN_PREPARATION,
  updatedAt: '2026-10-28T12:05:00.000Z',
};

export const KMS_FIXTURE_ORDER_READY: KmsOrderResultDto = {
  ...KMS_FIXTURE_ORDER_PLACED,
  status: FoodOrderStatus.READY,
  estimatedDeliveryMinutes: 5,
  updatedAt: '2026-10-28T12:20:00.000Z',
};

export const KMS_FIXTURE_ORDER_DELIVERED: KmsOrderResultDto = {
  ...KMS_FIXTURE_ORDER_PLACED,
  status: FoodOrderStatus.DELIVERED,
  estimatedDeliveryMinutes: 0,
  updatedAt: '2026-10-28T12:25:00.000Z',
};

export const KMS_FIXTURE_ORDER_CANCELLED: KmsOrderResultDto = {
  ...KMS_FIXTURE_ORDER_PLACED,
  status: FoodOrderStatus.CANCELLED,
  updatedAt: '2026-10-28T12:02:00.000Z',
};

/**
 * Older producer payload omitting optional estimatedDeliveryMinutes and allergyNotes
 */
export const KMS_FIXTURE_LEGACY_V1_ORDER = {
  orderId: 'order-legacy-001',
  roomNumber: '101',
  bookingId: 'booking-101',
  status: FoodOrderStatus.PLACED,
  totalAmount: 32.5,
  items: [
    {
      itemId: 'menu-item-002',
      name: 'Signature Wagyu Burger',
      unitPrice: 32.5,
      quantity: 1,
    },
  ],
  createdAt: '2026-10-28T11:00:00.000Z',
  updatedAt: '2026-10-28T11:00:00.000Z',
  version: '1.0',
};

/**
 * Forward-compatible payload containing newer additive fields
 */
export const KMS_FIXTURE_ADDITIVE_ORDER = {
  ...KMS_FIXTURE_ORDER_PLACED,
  orderId: 'order-additive-001',
  kitchenStationId: 'station-grill-4',
  estimatedCalories: 1250,
  chefNotes: 'Prepared by Sous Chef Marco',
  subtotalTax: 7.35,
};

export const KMS_FIXTURE_MALFORMED_ORDER = {
  orderId: '', // invalid empty id
  totalAmount: -10, // invalid negative amount
  items: [],
};
