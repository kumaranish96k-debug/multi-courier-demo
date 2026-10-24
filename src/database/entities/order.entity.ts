import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ShipmentStatus } from '../enums/shipment-status.enum.js';

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'client_order_id' })
  clientOrderId!: string;

  @Column({ name: 'courier_partner' })
  courierPartner!: string;

  @Column({ type: 'varchar', name: 'courier_order_id', nullable: true })
  courierOrderId!: string | null;

  @Column({ type: 'varchar', name: 'awb', nullable: true })
  awb!: string | null;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    default: ShipmentStatus.CREATED,
  })
  status!: ShipmentStatus;

  @Column({ type: 'jsonb', name: 'normalized_request' })
  normalizedRequest!: object;

  @Column({ type: 'jsonb', name: 'courier_request', nullable: true })
  courierRequest!: object | null;

  @Column({ type: 'jsonb', name: 'courier_response', nullable: true })
  courierResponse!: object | null;

  @Column({ type: 'text', name: 'failure_code', nullable: true })
  failureCode!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
