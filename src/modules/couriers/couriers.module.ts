import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { MockCourierAdapter } from './adapters/mock-courier.adapter.js';
import { UrbaneBoltAdapter } from './adapters/urbanebolt.adapter.js';
import { CouriersService } from './couriers.service.js';

@Module({
  imports: [DiscoveryModule],
  providers: [CouriersService, MockCourierAdapter, UrbaneBoltAdapter],
  exports: [CouriersService],
})
export class CouriersModule {}
