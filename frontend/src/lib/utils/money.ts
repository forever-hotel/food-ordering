/**
 * Monetary Calculation and Currency Formatting Utilities
 *
 * Uses integer minor units (cents / 1/100ths) internally to eliminate
 * IEEE-754 binary floating-point representation and rounding drift,
 * matching backend two-decimal monetary arithmetic.
 */

/**
 * Converts a major unit currency amount (e.g. 18.50) to integer minor units (e.g. 1850 cents).
 */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Converts integer minor units (e.g. 1850 cents) back to major currency units (e.g. 18.50).
 */
export function fromMinorUnits(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Rounds a major currency amount to 2 decimal places using integer minor units.
 */
export function roundMoney(amount: number): number {
  return fromMinorUnits(toMinorUnits(amount));
}

/**
 * Calculates a cart/order line total as (unitPrice in minor units * integer quantity) / 100.
 * Operates on integer minor units for the multiplication.
 */
export function calculateLineTotal(unitPrice: number, quantity: number): number {
  const unitCents = toMinorUnits(unitPrice);
  const totalCents = Math.round(unitCents * quantity);
  return fromMinorUnits(totalCents);
}

/**
 * Calculates a cart subtotal as the sum of all integer minor unit line totals,
 * converted back to major currency units.
 */
export function calculateSubtotal(items: { item: { price: number }; quantity: number }[]): number {
  const subtotalCents = items.reduce((sumCents, item) => {
    const itemCents = toMinorUnits(item.item.price);
    const lineCents = Math.round(itemCents * item.quantity);
    return sumCents + lineCents;
  }, 0);
  return fromMinorUnits(subtotalCents);
}

/**
 * Formats a currency amount into Sri Lankan Rupee (LKR) display text.
 * - Integer amounts (e.g. 1500) format as "LKR 1,500"
 * - Fractional amounts (e.g. 32.5) format as "LKR 32.50"
 */
export function formatLkrPrice(price: number): string {
  const rounded = roundMoney(price);
  const hasDecimals = rounded % 1 !== 0;
  return `LKR ${rounded.toLocaleString('en-US', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
