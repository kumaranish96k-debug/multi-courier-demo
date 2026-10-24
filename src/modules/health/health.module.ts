import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller.js';

@Module({
  imports: [BullModule.registerQueue({ name: 'bulk-orders' })],
  controllers: [HealthController],
})
export class HealthModule {}
