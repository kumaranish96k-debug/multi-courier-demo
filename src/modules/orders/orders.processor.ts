import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { OrdersService } from './orders.service.js';

@Processor('bulk-orders')
export class BulkProcessor extends WorkerHost {
  constructor(private readonly orders: OrdersService) {
    super();
  }
  async process(job: Job<{ batchId: string }>): Promise<void> {
    await this.orders.processBatch(job.data.batchId);
  }
}
