import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CreateBulkOrdersDto } from './dto/create-bulk-orders.dto.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: CreateOrderDto, @Req() request: FastifyRequest) {
    return this.orders.create(body, request.id);
  }

  @Get(':id/track')
  track(@Param('id') id: string, @Req() request: FastifyRequest) {
    return this.orders.track(id, request.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() request: FastifyRequest) {
    return this.orders.cancel(id, request.id);
  }

  @Post('bulk')
  createBulk(
    @Body() body: CreateBulkOrdersDto,
    @Req() request: FastifyRequest,
  ) {
    return this.orders.submitBatch(body.orders, request.id);
  }

  @Get('bulk/:id')
  getBatch(@Param('id') id: string) {
    return this.orders.getBatch(id);
  }
}
