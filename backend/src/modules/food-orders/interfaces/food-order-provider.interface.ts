import { CreateFoodOrderDto } from '../dto/create-food-order.dto.js';
import { FoodOrderResponseDto } from '../dto/food-order-response.dto.js';

export const FOOD_ORDER_PROVIDER = Symbol('FOOD_ORDER_PROVIDER');

export abstract class FoodOrderProvider {
  abstract createOrder(
    roomNumber: string,
    request: CreateFoodOrderDto,
  ): Promise<FoodOrderResponseDto>;

  abstract getOrder(orderId: string): Promise<FoodOrderResponseDto>;

  abstract cancelOrder(orderId: string): Promise<FoodOrderResponseDto>;
}
