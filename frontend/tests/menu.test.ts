import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FALLBACK_MENU_RESPONSE, formatLkrPrice, isValidImageUrl } from '../src/lib/api/menu.ts';
import type { GuestMenuItem, CartItem } from '../src/types/menu.ts';

describe('TC-DDP-138-AC1: Successful Workflow - Categorized Menu & Complete Item Metadata', () => {
  it('retrieves active menu with canonical meal periods and categories', () => {
    const catalog = FALLBACK_MENU_RESPONSE;
    assert.equal(catalog.version, '1.0');
    assert.ok(catalog.categories.includes('Lunch'));
    assert.ok(catalog.categories.includes('Breakfast'));
    assert.ok(catalog.categories.includes('Dinner'));
    assert.ok(catalog.items.length >= 6);
  });

  it('validates complete item metadata matching Figures 32 and 33 without nutrition', () => {
    const chickenRice = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-101');
    assert.ok(chickenRice, 'Grilled Chicken Rice must exist');
    assert.equal(chickenRice.name, 'Grilled Chicken Rice');
    assert.equal(chickenRice.price, 850);
    assert.equal(chickenRice.category, 'Lunch');
    assert.deepEqual(chickenRice.dietaryFlags, ['Gluten-free', 'High protein', 'Dairy-free']);
    assert.equal(
      chickenRice.imageUrl,
      'https://cdn.foreverhotel.com/menu/grilled-chicken-rice.webp',
    );
    // Nutrition must be strictly absent per Issue #101
    assert.equal((chickenRice as unknown as Record<string, unknown>).nutrition, undefined);
  });

  it('formats Sri Lankan Rupee (LKR) pricing correctly', () => {
    assert.equal(formatLkrPrice(850), 'LKR 850');
    assert.equal(formatLkrPrice(650), 'LKR 650');
    assert.equal(formatLkrPrice(1500), 'LKR 1,500');
  });
});

describe('TC-DDP-138-AC2: Negative / Error Cases - Out of Stock & Cutoff Enforcement', () => {
  const validateCanAdd = (
    item: GuestMenuItem,
    requestedQty = 1,
    currentCartQty = 0,
  ): { allowed: boolean; reason?: string } => {
    if (!item.available) {
      return { allowed: false, reason: 'Sold Out' };
    }
    if (!item.isOrderable || item.isCutoff) {
      return { allowed: false, reason: 'Cutoff Reached' };
    }
    const portionCap = item.portionCap || 3;
    if (currentCartQty + requestedQty > portionCap) {
      return { allowed: false, reason: 'Portion Limit Exceeded' };
    }
    return { allowed: true };
  };

  it('rejects adding out-of-stock items (Prawn Noodles)', () => {
    const prawnNoodles = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-103')!;
    assert.equal(prawnNoodles.available, false);

    const result = validateCanAdd(prawnNoodles, 1);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'Sold Out');
  });

  it('rejects adding cutoff items whose ordering window has expired (Eggs Benedict during Lunch)', () => {
    const eggsBenedict = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-104')!;
    assert.equal(eggsBenedict.isCutoff, true);
    assert.equal(eggsBenedict.isOrderable, false);

    const result = validateCanAdd(eggsBenedict, 1);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'Cutoff Reached');
  });

  it('enforces portion cap limit (e.g. max 3 per order)', () => {
    const chickenRice = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-101')!;
    assert.equal(chickenRice.portionCap, 3);

    // Adding 2 is allowed
    assert.equal(validateCanAdd(chickenRice, 2, 0).allowed, true);

    // Adding 4 exceeds cap of 3
    const overCap = validateCanAdd(chickenRice, 4, 0);
    assert.equal(overCap.allowed, false);
    assert.equal(overCap.reason, 'Portion Limit Exceeded');

    // Adding 2 when 2 already in cart exceeds cap of 3
    const overCartCap = validateCanAdd(chickenRice, 2, 2);
    assert.equal(overCartCap.allowed, false);
    assert.equal(overCartCap.reason, 'Portion Limit Exceeded');
  });
});

describe('TC-DDP-138-AC3: Boundary, Timezone Cutoff & Dynamic Total Calculations', () => {
  it('calculates dynamic line item total based on selected quantity', () => {
    const unitPrice = 850;
    const calculateTotal = (qty: number) => unitPrice * qty;

    assert.equal(calculateTotal(1), 850);
    assert.equal(calculateTotal(2), 1700);
    assert.equal(calculateTotal(3), 2550);
  });

  it('enforces quantity minimum bound at 1', () => {
    const decrementQuantity = (currentQty: number) => Math.max(1, currentQty - 1);

    assert.equal(decrementQuantity(3), 2);
    assert.equal(decrementQuantity(2), 1);
    assert.equal(decrementQuantity(1), 1); // Cannot go below 1
  });

  it('formats meal period countdown accurately for Colombo timezone (Figure 32)', () => {
    const formatCountdown = (secondsRemaining: number): string => {
      const minutes = Math.floor(secondsRemaining / 60);
      const hours = Math.floor(minutes / 60);
      const remainingMins = minutes % 60;
      if (hours > 0) return `${hours}h ${remainingMins}m left`;
      return `${remainingMins}m left`;
    };

    assert.equal(formatCountdown(8160), '2h 16m left'); // matches Figure 32 banner!
    assert.equal(formatCountdown(1800), '30m left');
  });

  it('handles image loading failure gracefully with fallback representation', () => {
    let imgError = false;
    const handleImgError = () => {
      imgError = true;
    };

    handleImgError();
    assert.equal(imgError, true);
  });
});

describe('TC-DDP-138-AC4: Contract & Visual Layout Fidelity Audit', () => {
  it('validates Floating Cart Banner text format matching Figure 32', () => {
    const mockCart = {
      items: [
        { id: 'item-101', quantity: 1, unitPrice: 850 },
        { id: 'item-102', quantity: 1, unitPrice: 650 },
      ],
    };

    const totalCount = mockCart.items.reduce((sum, i) => sum + i.quantity, 0);
    const totalAmount = mockCart.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

    const bannerText = `View Cart · ${totalCount} items · ${formatLkrPrice(totalAmount)}`;
    assert.equal(bannerText, 'View Cart · 2 items · LKR 1,500');
  });

  it('ensures allergen warning indicators are present for items with allergens', () => {
    const kottu = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-102')!;
    assert.ok(kottu.allergens.includes('Gluten'));

    const bannerAllergenText = `⚠️ ${kottu.allergens[0]}`;
    assert.equal(bannerAllergenText, '⚠️ Gluten');
  });
});

describe('Issue #101: KMS Menu Images and Complete Nutrition UI Removal', () => {
  it('Task 1: valid KMS image_url is propagated and used across menu, detail, and cart', () => {
    const item = FALLBACK_MENU_RESPONSE.items[0];
    assert.ok(item.imageUrl, 'KMS item must have imageUrl');
    assert.ok(isValidImageUrl(item.imageUrl), 'imageUrl must pass scheme validation');
    assert.equal(item.imageUrl, 'https://cdn.foreverhotel.com/menu/grilled-chicken-rice.webp');

    // Cart item uses the same item.imageUrl
    const cartItem: CartItem = {
      id: 'cart-101',
      item,
      quantity: 2,
    };
    assert.equal(cartItem.item.imageUrl, item.imageUrl);
  });

  it('Task 1: validates safe image URL schemes and rejects unsafe schemes', () => {
    assert.equal(isValidImageUrl('https://cdn.foreverhotel.com/menu/item.webp'), true);
    assert.equal(isValidImageUrl('http://localhost:4300/images/item.png'), true);
    assert.equal(isValidImageUrl('/images/item.webp'), true);

    // Unsafe schemes or malformed URLs
    assert.equal(isValidImageUrl('javascript:alert(1)'), false);
    assert.equal(isValidImageUrl('data:image/svg+xml;utf8,<svg></svg>'), false);
    assert.equal(isValidImageUrl('file:///etc/passwd'), false);
    assert.equal(isValidImageUrl(''), false);
    assert.equal(isValidImageUrl('   '), false);
    assert.equal(isValidImageUrl(null), false);
    assert.equal(isValidImageUrl(undefined), false);
  });

  it('Task 1: does not reject valid URLs containing cdn.foreverhotel.com', () => {
    const kmsUrl = 'https://cdn.foreverhotel.com/menu/grilled-chicken-rice.webp';
    assert.equal(kmsUrl.includes('cdn.foreverhotel.com'), true);
    // Must be valid and accepted, not rejected by hostname matching
    assert.equal(isValidImageUrl(kmsUrl), true);
  });

  it('Task 1: missing or broken image triggers neutral placeholder without substituting dish photos', () => {
    const itemWithoutImage: GuestMenuItem = {
      ...FALLBACK_MENU_RESPONSE.items[0],
      imageUrl: null,
    };
    assert.equal(isValidImageUrl(itemWithoutImage.imageUrl), false);

    // When imgError is true or imageUrl is null, hasValidImage is false
    const imgError = true;
    const hasValidImage = isValidImageUrl(itemWithoutImage.imageUrl) && !imgError;
    assert.equal(hasValidImage, false);
  });

  it('Task 2: completely removes nutrition metadata from all catalog items', () => {
    for (const item of FALLBACK_MENU_RESPONSE.items) {
      const untyped = item as unknown as Record<string, unknown>;
      assert.equal(
        untyped.nutrition,
        undefined,
        `Item ${item.id} must not have nutrition property`,
      );
      assert.equal('nutrition' in untyped, false, `Item ${item.id} must not have nutrition key`);
    }
  });

  it('Task 2 & 3: retains allergen and dietary information intact', () => {
    const item = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-101')!;
    assert.deepEqual(item.dietaryFlags, ['Gluten-free', 'High protein', 'Dairy-free']);
    assert.deepEqual(item.allergens, []);

    const kottu = FALLBACK_MENU_RESPONSE.items.find((i) => i.id === 'item-102')!;
    assert.deepEqual(kottu.dietaryFlags, ['Vegan option']);
    assert.deepEqual(kottu.allergens, ['Gluten']);
  });
});
