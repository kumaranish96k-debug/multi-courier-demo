import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { BullRootModuleOptions } from '@nestjs/bullmq';
import { BatchEntity } from '../database/entities/batch.entity.js';
import { OrderEntity } from '../database/entities/order.entity.js';
import { TrackingHistoryEntity } from '../database/entities/tracking-history.entity.js';

export function databaseConfig(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get<string>('DATABASE_HOST', 'localhost'),
    port: Number(config.get<string | number>('DATABASE_PORT', 5432)),
    username: config.get<string>('DATABASE_USER', 'postgres'),
    password: config.get<string>('DATABASE_PASSWORD', 'postgres'),
    database: config.get<string>('DATABASE_NAME', 'multi_courier'),
    entities: [OrderEntity, TrackingHistoryEntity, BatchEntity],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: false,
    migrationsRun: false,
    retryAttempts: 5,
    retryDelay: 3000,
    extra: {
      max: Number(config.get<string | number>('DATABASE_POOL_SIZE', 10)),
      connectionTimeoutMillis: Number(
        config.get<string | number>('DATABASE_CONNECT_TIMEOUT_MS', 5000),
      ),
    },
  };
}

export function redisConfig(config: ConfigService): BullRootModuleOptions {
  return {
    connection: {
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(config.get<string | number>('REDIS_PORT', 6379)),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: null,
    },
  };
}
