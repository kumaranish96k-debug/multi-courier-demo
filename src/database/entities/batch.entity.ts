import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('order_batches')
export class BatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'jsonb' })
  items!: Array<{
    order_id: string;
    courier_partner: string;
    payload: object;
  }>;

  @Column({ type: 'jsonb', default: '[]' })
  results!: object[];

  @Column({ default: 'QUEUED' })
  status!: string;

  @Column({ name: 'request_id', type: 'varchar', nullable: true })
  requestId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
