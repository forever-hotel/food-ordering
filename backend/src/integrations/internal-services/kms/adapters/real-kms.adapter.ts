import { Injectable, Logger } from '@nestjs/common';
import { UpstreamServiceUnavailableException } from '../../../contracts/upstream-integration.exception.js';
import { FoodOrderStatus } from '../../../../modules/food-orders/enums/food-order-status.enum.js';
import { KmsMenuCatalogDto, MealPeriod } from '../dto/kms-menu.dto.js';
import { KmsCreateOrderDto } from '../dto/kms-order.dto.js';
import { KmsOrderResultDto } from '../dto/kms-order-result.dto.js';
import { KmsProvider } from '../interfaces/kms-provider.interface.js';

@Injectable()
export class RealKmsAdapter implements KmsProvider {
  private readonly logger = new Logger(RealKmsAdapter.name);

  constructor(
    private readonly baseUrl?: string,
    private readonly apiKey?: string,
  ) {}

  public async getMenuCatalog(
    mealPeriod?: MealPeriod,
  ): Promise<KmsMenuCatalogDto> {
    this.assertConfigured();
    // Real HTTP integration will be hooked up when KMS counterpart deployment is verified
    return this.executeHttpCall<KmsMenuCatalogDto>('/api/v1/menu', 'GET', {
      mealPeriod,
    });
  }

  public async createOrder(
    order: KmsCreateOrderDto,
  ): Promise<KmsOrderResultDto> {
    this.assertConfigured();
    return this.executeHttpCall<KmsOrderResultDto>(
      '/api/v1/orders',
      'POST',
      order,
    );
  }

  public async getOrder(orderId: string): Promise<KmsOrderResultDto | null> {
    this.assertConfigured();
    return this.executeHttpCall<KmsOrderResultDto>(
      `/api/v1/orders/${encodeURIComponent(orderId)}`,
      'GET',
    );
  }

  public async cancelOrder(
    orderId: string,
    reason?: string,
  ): Promise<KmsOrderResultDto> {
    this.assertConfigured();
    return this.executeHttpCall<KmsOrderResultDto>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/cancel`,
      'POST',
      { reason },
    );
  }

  public async transitionOrderStatus(
    orderId: string,
    newStatus: FoodOrderStatus,
  ): Promise<KmsOrderResultDto> {
    this.assertConfigured();
    return this.executeHttpCall<KmsOrderResultDto>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/status`,
      'PATCH',
      { status: newStatus },
    );
  }

  private assertConfigured(): void {
    if (!this.baseUrl || this.baseUrl.trim() === '') {
      this.logger.error(
        'KMS service URL is missing or unconfigured. Failing closed.',
      );
      throw new UpstreamServiceUnavailableException(
        'KMS',
        'Kitchen Management System endpoint is unconfigured in this environment.',
      );
    }
  }

  private async executeHttpCall<T>(
    endpoint: string,
    method: string,
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    this.logger.log(`Executing upstream KMS request: ${method} ${url}`);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.apiKey ? { 'X-KMS-API-Key': this.apiKey } : {}),
        },
        body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(
          `Upstream KMS returned HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (err: any) {
      this.logger.error(`Upstream KMS request failed: ${err.message}`);
      throw new UpstreamServiceUnavailableException('KMS', err.message);
    }
  }
}
