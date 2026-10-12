import { CreateFoodOrderDto } from '../dto/create-food-order.dto.js';
import { FoodOrderResponseDto } from '../dto/food-order-response.dto.js';

export interface FoodOrderProvider {
  createOrder(
    roomNumber: string,
    request: CreateFoodOrderDto,
  ): Promise<FoodOrderResponseDto>;

  getOrder(orderId: string): Promise<FoodOrderResponseDto>;

  cancelOrder(orderId: string): Promise<FoodOrderResponseDto>;
}
