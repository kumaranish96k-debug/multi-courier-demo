import { IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';
import type { OrderInput } from '../orders.service.js';

export class CreateOrderDto implements OrderInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  courier_partner!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  order_id!: string;

  @IsObject()
  payload!: Record<string, any>;
}
