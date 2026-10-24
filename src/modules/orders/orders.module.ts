import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '../../database/entities/order.entity.js';
import { TrackingHistoryEntity } from '../../database/entities/tracking-history.entity.js';
import { BatchEntity } from '../../database/entities/batch.entity.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { BulkProcessor } from './orders.processor.js';
import { BullModule } from '@nestjs/bullmq';
import { CouriersModule } from '../couriers/couriers.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, TrackingHistoryEntity, BatchEntity]),
    BullModule.registerQueue({ name: 'bulk-orders' }),
    CouriersModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, BulkProcessor],
})
export class OrdersModule {}
