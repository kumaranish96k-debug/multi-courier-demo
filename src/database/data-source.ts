import 'dotenv/config';
import { DataSource } from 'typeorm';
import { BatchEntity } from './entities/batch.entity.js';
import { OrderEntity } from './entities/order.entity.js';
import { TrackingHistoryEntity } from './entities/tracking-history.entity.js';

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'postgres',
  database: process.env.DATABASE_NAME ?? 'multi_courier',
  entities: [OrderEntity, TrackingHistoryEntity, BatchEntity],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
