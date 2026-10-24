import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ShipmentStatus } from '../enums/shipment-status.enum.js';

@Entity('tracking_history')
export class TrackingHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'order_id' })
  orderId!: string;

  @Column({ type: 'enum', enum: ShipmentStatus })
  status!: ShipmentStatus;

  @Column({ type: 'jsonb', name: 'raw_payload' })
  rawPayload!: object;

  @CreateDateColumn({ name: 'recorded_at' })
  recordedAt!: Date;
}
