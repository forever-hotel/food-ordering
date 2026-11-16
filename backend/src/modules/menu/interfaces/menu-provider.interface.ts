import { MenuResponseDto } from '../dto/menu-response.dto.js';

export interface MenuProvider {
  getMenu(): Promise<MenuResponseDto>;
}
