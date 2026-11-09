import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KmsProvider,
  KMS_PROVIDER,
} from '../../integrations/internal-services/kms/interfaces/kms-provider.interface.js';
import {
  KmsMenuItemDto,
  KmsMenuCatalogDto,
} from '../../integrations/internal-services/kms/dto/kms-menu.dto.js';
import { RedisService } from '../../redis/redis.service.js';
import { GetMenuQueryDto } from './dto/get-menu-query.dto.js';
import { GuestMenuItemDto } from './dto/guest-menu-item.dto.js';
import { GuestMenuResponseDto } from './dto/guest-menu-response.dto.js';
import { MealWindowStatusDto } from './dto/meal-window-status.dto.js';
import { HotelClockService } from './services/hotel-clock.service.js';
import { MealWindowService } from './services/meal-window.service.js';

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    @Inject(KMS_PROVIDER)
    private readonly kmsProvider: KmsProvider,
    private readonly mealWindowService: MealWindowService,
    private readonly clockService: HotelClockService,
    @Optional()
    private readonly redisService?: RedisService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private get catalogCache(): RedisService | undefined {
    // Live KMS invalidations cause immediate REST reads, never five-minute stale stock.
    return this.config?.get<string>('SHARED_DATABASE_MODE') === 'true'
      ? undefined
      : this.redisService;
  }

  public async getGuestMenu(
    query?: GetMenuQueryDto,
  ): Promise<GuestMenuResponseDto> {
    const now = this.clockService.now();
    const { isoColombo } = this.clockService.getColomboTimeParts(now);
    let activeMealPeriods = this.mealWindowService.getActiveMealPeriods(now);
    let mealWindows = this.mealWindowService.getAllWindowStatuses(now);

    this.logger.log(
      `Fetching menu catalog. Active meal periods in Colombo [${isoColombo}]: ${activeMealPeriods.join(', ') || 'None'}`,
    );

    const cacheKey = `foss:menu:catalog:v1:${query?.mealPeriod || 'ALL'}`;
    let catalog = this.catalogCache
      ? await this.catalogCache.get<KmsMenuCatalogDto>(cacheKey)
      : null;

    if (!catalog) {
      catalog = await this.kmsProvider.getMenuCatalog(query?.mealPeriod);
      if (this.catalogCache) {
        await this.catalogCache.set(cacheKey, catalog);
      }
    }

    if (catalog.items.some((item) => item.orderingWindow)) {
      const windows = new Map<string, (typeof mealWindows)[number]>();
      for (const item of catalog.items) {
        if (!item.orderingWindow) continue;
        const status = this.mealWindowService.evaluateKitchenWindow(
          item.orderingWindow,
          now,
        );
        const period = item.mealPeriods[0];
        if (!period) continue;
        windows.set(period, {
          period,
          name: item.category,
          startTime: item.orderingWindow.startTime,
          cutoffTime: item.orderingWindow.cutoffTime,
          enabled: item.orderingWindow.enabled,
          isActive: status.isOrderable,
          isCutoffReached: status.isCutoff,
          secondsRemaining: status.secondsRemaining,
        });
      }
      mealWindows = [...windows.values()];
      activeMealPeriods = mealWindows
        .filter((window) => window.isActive)
        .map((window) => window.period);
    }
    let mappedItems: GuestMenuItemDto[] = catalog.items.map((item) =>
      this.enrichMenuItem(item, now),
    );

    // Apply category filter if provided
    if (query?.category) {
      mappedItems = mappedItems.filter(
        (i) => i.category.toLowerCase() === query.category!.toLowerCase(),
      );
    }

    // Apply availableOnly filter if provided
    if (query?.availableOnly) {
      mappedItems = mappedItems.filter((i) => i.isOrderable);
    }

    return {
      currentTimeInColombo: isoColombo,
      activeMealPeriods,
      categories: catalog.categories,
      mealWindows: mealWindows.map((w) => ({ ...w })),
      items: mappedItems,
      totalItems: mappedItems.length,
      version: catalog.version,
    };
  }

  public async getItemById(id: string): Promise<GuestMenuItemDto> {
    const cacheKey = 'foss:menu:catalog:v1:ALL';
    let catalog = this.catalogCache
      ? await this.catalogCache.get<KmsMenuCatalogDto>(cacheKey)
      : null;

    if (!catalog) {
      catalog = await this.kmsProvider.getMenuCatalog();
      if (this.catalogCache) {
        await this.catalogCache.set(cacheKey, catalog);
      }
    }

    const item = catalog.items.find((i) => i.id === id);

    if (!item) {
      throw new NotFoundException(
        `Menu item [${id}] was not found in the catalog.`,
      );
    }

    return this.enrichMenuItem(item, this.clockService.now());
  }

  public async invalidateMenuCache(): Promise<void> {
    if (this.redisService) {
      await this.redisService.flushPattern('foss:menu:catalog:v1:');
    }
  }

  public getMealWindows(): MealWindowStatusDto[] {
    return this.mealWindowService.getAllWindowStatuses().map((w) => ({ ...w }));
  }

  private enrichMenuItem(item: KmsMenuItemDto, date: Date): GuestMenuItemDto {
    const orderableInfo = item.orderingWindow
      ? this.mealWindowService.evaluateKitchenWindow(item.orderingWindow, date)
      : this.mealWindowService.isItemOrderable(item.mealPeriods, date);

    // Item must be in stock AND its meal window must be currently active to be orderable
    const isOrderable = item.available && orderableInfo.isOrderable;

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      mealPeriods: item.mealPeriods,
      available: item.available,
      isOrderable,
      isCutoff: orderableInfo.isCutoff,
      secondsRemainingUntilCutoff: orderableInfo.secondsRemaining,
      estimatedPrepMinutes: item.estimatedPrepMinutes,
      portionCap: item.portionLimit,
      imageUrl: item.imageUrl,
      dietaryFlags: item.dietaryFlags,
      allergens: item.allergens,
    };
  }
}
