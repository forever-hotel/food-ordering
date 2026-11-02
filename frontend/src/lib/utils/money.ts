/**
 * Monetary Calculation and Currency Formatting Utilities
 *
 * Implements IEEE-754 floating point safe arithmetic for prices, subtotals,
 * and Sri Lankan Rupee (LKR) formatting.
 */

/**
 * Rounds a monetary amount to 2 decimal places to eliminate floating-point drift.
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates a cart/order line total as unitPrice * quantity rounded to 2 decimal places.
 */
export function calculateLineTotal(unitPrice: number, quantity: number): number {
  return roundMoney(unitPrice * quantity);
}

/**
 * Calculates a cart subtotal as the sum of all rounded line totals.
 */
export function calculateSubtotal(items: { item: { price: number }; quantity: number }[]): number {
  const sum = items.reduce(
    (total, item) => total + calculateLineTotal(item.item.price, item.quantity),
    0,
  );
  return roundMoney(sum);
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
