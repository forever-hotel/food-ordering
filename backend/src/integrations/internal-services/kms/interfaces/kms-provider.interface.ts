import { KmsMenuCatalogDto, MealPeriod } from '../dto/kms-menu.dto.js';
import { KmsCreateOrderDto } from '../dto/kms-order.dto.js';
import { KmsOrderResultDto } from '../dto/kms-order-result.dto.js';

export const KMS_PROVIDER = Symbol('KMS_PROVIDER');

export interface KmsProvider {
  getMenuCatalog(mealPeriod?: MealPeriod): Promise<KmsMenuCatalogDto>;
  createOrder(order: KmsCreateOrderDto): Promise<KmsOrderResultDto>;
  getOrder(orderId: string): Promise<KmsOrderResultDto | null>;
  cancelOrder(orderId: string, reason?: string): Promise<KmsOrderResultDto>;
}
