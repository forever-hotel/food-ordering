/**
 * Order Policy Constants
 *
 * Authoritative quantity constraints matching FOSS backend validation rules:
 * - backend/src/modules/food-orders/dto/create-food-order-item.dto.ts (@Min(1), @Max(20))
 * - backend/src/modules/food-orders/food-orders.service.ts
 */

export const MIN_ORDER_ITEM_QUANTITY = 1;
export const MAX_ORDER_ITEM_QUANTITY = 20;
