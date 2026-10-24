import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue('bulk-orders') private readonly queue: Queue,
  ) {}

  @Get()
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
      await this.queue.waitUntilReady();
      return { status: 'ok', dependencies: { database: 'ok', redis: 'ok' } };
    } catch {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'A required service is unavailable',
      });
    }
  }
}
