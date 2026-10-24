import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateOrderDto } from './create-order.dto.js';

export class CreateBulkOrdersDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(Number(process.env.BULK_MAX_ORDERS ?? 100))
  @ValidateNested({ each: true })
  @Type(() => CreateOrderDto)
  orders!: CreateOrderDto[];
}
