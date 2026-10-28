import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  KmsProvider,
  KMS_PROVIDER,
} from '../../integrations/internal-services/kms/interfaces/kms-provider.interface.js';
import { KmsMenuItemDto } from '../../integrations/internal-services/kms/dto/kms-menu.dto.js';
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
  ) {}

  public async getGuestMenu(
    query?: GetMenuQueryDto,
  ): Promise<GuestMenuResponseDto> {
    const now = this.clockService.now();
    const { isoColombo } = this.clockService.getColomboTimeParts(now);
    const activeMealPeriods = this.mealWindowService.getActiveMealPeriods(now);
    const mealWindows = this.mealWindowService.getAllWindowStatuses(now);

    this.logger.log(
      `Fetching menu catalog. Active meal periods in Colombo [${isoColombo}]: ${activeMealPeriods.join(', ') || 'None'}`,
    );

    const catalog = await this.kmsProvider.getMenuCatalog(query?.mealPeriod);

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
    const catalog = await this.kmsProvider.getMenuCatalog();
    const item = catalog.items.find((i) => i.id === id);

    if (!item) {
      throw new NotFoundException(
        `Menu item [${id}] was not found in the catalog.`,
      );
    }

    return this.enrichMenuItem(item, this.clockService.now());
  }

  public getMealWindows(): MealWindowStatusDto[] {
    return this.mealWindowService.getAllWindowStatuses().map((w) => ({ ...w }));
  }

  private enrichMenuItem(item: KmsMenuItemDto, date: Date): GuestMenuItemDto {
    const orderableInfo = this.mealWindowService.isItemOrderable(
      item.mealPeriods,
      date,
    );

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
      imageUrl: item.imageUrl,
      dietaryFlags: item.dietaryFlags,
      allergens: item.allergens,
    };
  }
}
