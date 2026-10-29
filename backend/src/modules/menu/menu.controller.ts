import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GuestAuthGuard } from '../guest-sessions/guards/guest-auth.guard.js';
import { CurrentGuest } from '../guest-sessions/decorators/current-guest.decorator.js';
import type { GuestContext } from '../guest-sessions/interfaces/guest-context.interface.js';
import { GetMenuQueryDto } from './dto/get-menu-query.dto.js';
import { GuestMenuItemDto } from './dto/guest-menu-item.dto.js';
import { GuestMenuResponseDto } from './dto/guest-menu-response.dto.js';
import { MealWindowStatusDto } from './dto/meal-window-status.dto.js';
import { MenuService } from './menu.service.js';

@ApiTags('Menu')
@ApiBearerAuth()
@Controller('menu')
@UseGuards(GuestAuthGuard)
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  @ApiOperation({
    summary:
      'Retrieve available guest menu catalog with meal windows and ordering cutoffs',
  })
  @ApiResponse({
    status: 200,
    description: 'Active menu catalog returned successfully',
    type: GuestMenuResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized: Valid guest session required',
  })
  @ApiResponse({
    status: 503,
    description: 'Upstream KMS service unavailable',
  })
  public async getMenu(
    @Query() query: GetMenuQueryDto,
    @CurrentGuest() _guest: GuestContext,
  ): Promise<GuestMenuResponseDto> {
    return this.menuService.getGuestMenu(query);
  }

  @Get('windows')
  @ApiOperation({
    summary:
      'Retrieve authoritative meal window schedules and cutoff states in Asia/Colombo',
  })
  @ApiResponse({
    status: 200,
    description: 'Meal window schedules returned successfully',
    type: [MealWindowStatusDto],
  })
  public getMealWindows(
    @CurrentGuest() _guest: GuestContext,
  ): MealWindowStatusDto[] {
    return this.menuService.getMealWindows();
  }

  @Get('items/:id')
  @ApiOperation({
    summary: 'Retrieve detailed information for a specific menu item',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique menu item identifier',
    example: 'menu-item-001',
  })
  @ApiResponse({
    status: 200,
    description: 'Menu item details returned successfully',
    type: GuestMenuItemDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Menu item not found in catalog',
  })
  public async getMenuItem(
    @Param('id') id: string,
    @CurrentGuest() _guest: GuestContext,
  ): Promise<GuestMenuItemDto> {
    return this.menuService.getItemById(id);
  }
}
