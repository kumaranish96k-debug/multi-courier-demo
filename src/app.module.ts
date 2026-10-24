import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envValidationSchema } from './config/env.validation.js';
import { databaseConfig, redisConfig } from './config/runtime.config.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: redisConfig,
    }),
    OrdersModule,
    HealthModule,
  ],
})
export class AppModule {}
