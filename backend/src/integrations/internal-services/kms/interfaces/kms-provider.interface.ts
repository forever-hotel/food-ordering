import { KmsMenuCatalogDto, MealPeriod } from '../dto/kms-menu.dto.js';
import { KmsCreateOrderDto } from '../dto/kms-order.dto.js';
import { KmsOrderResultDto } from '../dto/kms-order-result.dto.js';

export const KMS_PROVIDER = Symbol('KMS_PROVIDER');

export abstract class KmsProvider {
  abstract getMenuCatalog(mealPeriod?: MealPeriod): Promise<KmsMenuCatalogDto>;
  abstract createOrder(order: KmsCreateOrderDto): Promise<KmsOrderResultDto>;
  abstract getOrder(orderId: string): Promise<KmsOrderResultDto | null>;
  abstract cancelOrder(
    orderId: string,
    reason?: string,
  ): Promise<KmsOrderResultDto>;
}
