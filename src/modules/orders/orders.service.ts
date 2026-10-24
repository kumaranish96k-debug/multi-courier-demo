import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { isDeepStrictEqual } from 'node:util';
import { BatchEntity } from '../../database/entities/batch.entity.js';
import { OrderEntity } from '../../database/entities/order.entity.js';
import { TrackingHistoryEntity } from '../../database/entities/tracking-history.entity.js';
import { ShipmentStatus } from '../../database/enums/shipment-status.enum.js';
import { CouriersService } from '../couriers/couriers.service.js';
import {
  BatchInputError,
  CourierOperationError,
  IdempotencyConflictError,
} from '../../common/errors/order.errors.js';

export interface OrderInput {
  courier_partner: string;
  order_id: string;
  payload: Record<string, any>;
}

export interface BatchOrderResult {
  clientOrderId: string;
  status: string;
  awb: string | null;
  error?: { code: string; message: string };
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(TrackingHistoryEntity)
    private readonly history: Repository<TrackingHistoryEntity>,
    @InjectRepository(BatchEntity)
    private readonly batches: Repository<BatchEntity>,
    @InjectQueue('bulk-orders') private readonly queue: Queue,
    private readonly couriers: CouriersService,
  ) {}

  async create(input: OrderInput, requestId?: string) {
    const adapter = this.couriers.get(input.courier_partner);
    const existing = await this.orders.findOneBy({
      clientOrderId: input.order_id,
    });

    if (existing) return this.existingOrder(existing, input);

    const courierInput = {
      order_id: input.order_id,
      payload: input.payload,
    };
    const courierRequest = adapter.prepareCreate(courierInput);

    const row = this.orders.create({
      clientOrderId: input.order_id,
      courierPartner: input.courier_partner.trim().toLowerCase(),
      status: ShipmentStatus.SUBMITTING,
      normalizedRequest: input,
      courierOrderId: null,
      awb: null,
      courierRequest,
      courierResponse: null,
      failureCode: null,
    });

    // Reserve the client ID before calling the provider so concurrent retries
    // cannot create a second shipment for the same order.
    try {
      await this.orders.insert(row);
    } catch (error: any) {
      // The unique constraint is the final authority when identical requests race.
      if (error?.code === '23505') {
        const winner = await this.orders.findOneBy({
          clientOrderId: input.order_id,
        });
        if (winner) return this.existingOrder(winner, input);
      }
      throw error;
    }

    try {
      const result = await adapter.create(courierInput, courierRequest);

      row.courierOrderId = result.courierOrderId;
      row.awb = result.awb;
      row.status = result.status;
      row.courierRequest = result.request;
      row.courierResponse = result.response;
    } catch (err: any) {
      const rejected = err?.message === 'COURIER_REJECTED';
      const notSent =
        err?.message === 'UrbaneBolt credentials are not configured' ||
        err?.message === 'UrbaneBolt authentication returned no token';
      row.status =
        rejected || notSent
          ? ShipmentStatus.FAILED
          : ShipmentStatus.RECONCILIATION_REQUIRED;
      row.failureCode = rejected
        ? 'COURIER_REQUEST_REJECTED'
        : notSent
          ? 'COURIER_CONFIGURATION_ERROR'
          : 'COURIER_OUTCOME_UNKNOWN';

      await this.orders.save(row);

      this.logger.error(
        JSON.stringify({
          order_id: input.order_id,
          courier_partner: input.courier_partner,
          request_id: requestId ?? null,
          error_type: row.failureCode,
          stack: err?.stack,
        }),
      );

      throw new CourierOperationError(row.failureCode);
    }

    await this.orders.save(row);

    await this.history.save(
      this.history.create({
        orderId: row.id,
        status: row.status,
        rawPayload: row.courierResponse ?? {},
      }),
    );

    return this.view(row, false);
  }

  async track(orderId: string, requestId?: string) {
    const row = await this.find(orderId);

    // Cancellation is terminal; a later stale courier poll must not revive it.
    if (
      row.status === ShipmentStatus.CANCELLED ||
      row.status === ShipmentStatus.RECONCILIATION_REQUIRED
    ) {
      return this.trackingView(row);
    }

    let result;
    try {
      result = await this.couriers.get(row.courierPartner).track(row);
    } catch (err: any) {
      const code =
        err?.message === 'COURIER_REJECTED'
          ? 'COURIER_REQUEST_REJECTED'
          : 'COURIER_UNAVAILABLE';
      this.logCourierFailure(orderId, row.courierPartner, requestId, code, err);
      throw new CourierOperationError(code);
    }

    row.status = result.status;
    await this.orders.save(row);

    // Store each poll response as an audit event, even if status is unchanged.
    await this.history.save(
      this.history.create({
        orderId: row.id,
        status: result.status,
        rawPayload: result.raw,
      }),
    );

    return this.trackingView(row);
  }

  async cancel(orderId: string, requestId?: string) {
    const row = await this.find(orderId);

    if (row.status === ShipmentStatus.RECONCILIATION_REQUIRED) {
      throw new CourierOperationError('COURIER_OUTCOME_UNKNOWN');
    }

    let courierResponse: object;
    try {
      courierResponse = await this.couriers.get(row.courierPartner).cancel(row);
    } catch (err: any) {
      const code =
        err?.message === 'COURIER_REJECTED'
          ? 'COURIER_REQUEST_REJECTED'
          : 'COURIER_UNAVAILABLE';
      this.logCourierFailure(orderId, row.courierPartner, requestId, code, err);
      throw new CourierOperationError(code);
    }

    row.status = ShipmentStatus.CANCELLED;
    row.courierResponse = courierResponse;
    await this.orders.save(row);

    await this.history.save(
      this.history.create({
        orderId: row.id,
        status: row.status,
        rawPayload: courierResponse,
      }),
    );

    return { order_id: row.clientOrderId, status: row.status };
  }

  async submitBatch(items: OrderInput[], requestId: string) {
    const max = Number(process.env.BULK_MAX_ORDERS ?? 100);

    if (!items.length || items.length > max)
      throw new BatchInputError(`orders must contain 1 to ${max} entries`);

    const ids = items.map((x) => x.order_id);

    if (new Set(ids).size !== ids.length)
      throw new BatchInputError(
        'order_id values must be unique within a batch',
      );

    // Catch unsupported courier values before accepting asynchronous work.
    items.forEach((item) => this.couriers.get(item.courier_partner));

    const batch = await this.batches.save(
      this.batches.create({
        items: items.map((x) => ({ ...x })),
        status: 'QUEUED',
        requestId,
        results: items.map((item) => ({
          clientOrderId: item.order_id,
          status: 'PROCESSING',
          awb: null,
        })),
      }),
    );

    await this.queue.add(
      'process',
      { batchId: batch.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );

    return this.batchResponse(batch);
  }
  async getBatch(id: string) {
    const batch = await this.batches.findOneBy({ id });

    if (!batch)
      throw new NotFoundException({
        code: 'BATCH_NOT_FOUND',
        message: 'Batch not found',
      });

    return this.batchResponse(batch);
  }
  async processBatch(id: string) {
    const batch = await this.batches.findOneBy({ id });

    if (!batch) return;

    batch.status = 'PROCESSING';

    await this.batches.save(batch);

    const concurrency = Math.max(1, Number(process.env.BULK_CONCURRENCY ?? 10));
    const results = this.batchOrders(batch);

    for (let i = 0; i < batch.items.length; i += concurrency) {
      const group = batch.items.slice(i, i + concurrency);
      const groupResults = await Promise.all(
        group.map(async (item) => {
          try {
            const result = await this.create(
              item,
              batch.requestId ?? undefined,
            );

            return {
              clientOrderId: item.order_id,
              status: result.status,
              awb: result.awb,
              ...(result.error ? { error: result.error } : {}),
            } satisfies BatchOrderResult;
          } catch (err: any) {
            if (!(err instanceof CourierOperationError)) {
              this.logger.error(
                JSON.stringify({
                  order_id: item.order_id,
                  courier_partner: item.courier_partner,
                  request_id: batch.requestId,
                  error_type: 'BULK_ORDER_PROCESSING_ERROR',
                  stack: err instanceof Error ? err.stack : undefined,
                }),
              );
            }

            return {
              clientOrderId: item.order_id,
              status:
                err?.code === 'COURIER_OUTCOME_UNKNOWN'
                  ? ShipmentStatus.RECONCILIATION_REQUIRED
                  : ShipmentStatus.FAILED,
              awb: null,
              error: {
                code: err?.code ?? 'COURIER_UNAVAILABLE',
                message: err?.safeMessage ?? 'Order could not be created',
              },
            } satisfies BatchOrderResult;
          }
        }),
      );

      groupResults.forEach((result, index) => {
        results[i + index] = result;
      });

      batch.results = results;

      await this.batches.save(batch);
    }
    batch.status = 'COMPLETED';
    batch.results = results;

    await this.batches.save(batch);
  }

  private batchResponse(batch: BatchEntity) {
    const orders = this.batchOrders(batch);
    const successfulOrders = orders.filter(
      (order) =>
        order.status !== 'PROCESSING' &&
        order.status !== ShipmentStatus.FAILED &&
        order.status !== ShipmentStatus.RECONCILIATION_REQUIRED,
    ).length;
    const failedOrders = orders.filter(
      (order) =>
        order.status === ShipmentStatus.FAILED ||
        order.status === ShipmentStatus.RECONCILIATION_REQUIRED,
    ).length;

    return {
      id: batch.id,
      status: batch.status === 'QUEUED' ? 'PROCESSING' : batch.status,
      totalOrders: batch.items.length,
      successfulOrders,
      failedOrders,
      orders,
    };
  }

  private async trackingView(row: OrderEntity) {
    return {
      order_id: row.clientOrderId,
      courier_partner: row.courierPartner,
      courier_order_id: row.courierOrderId,
      awb: row.awb,
      status: row.status,
      ...(row.failureCode
        ? {
            error: {
              code: row.failureCode,
              message:
                row.failureCode === 'COURIER_OUTCOME_UNKNOWN'
                  ? 'Shipment outcome is unknown and requires reconciliation'
                  : 'Courier shipment could not be created',
            },
          }
        : {}),
      tracking_history: await this.history.find({
        where: { orderId: row.id },
        order: { recordedAt: 'ASC' },
      }),
    };
  }

  private batchOrders(batch: BatchEntity): BatchOrderResult[] {
    const saved = Array.isArray(batch.results) ? batch.results : [];

    return batch.items.map((item, index) => {
      const entry = saved[index] as any;
      if (!entry) {
        return {
          clientOrderId: item.order_id,
          status: 'PROCESSING',
          awb: null,
        };
      }

      // Read old persisted batch result records during the response migration.
      if (entry.clientOrderId) return entry as BatchOrderResult;
      if (entry.order_id) {
        return {
          clientOrderId: entry.order_id,
          status: entry.success
            ? (entry.result?.status ?? 'CREATED')
            : 'FAILED',
          awb: entry.success ? (entry.result?.awb ?? null) : null,
          ...(entry.error ? { error: entry.error } : {}),
        };
      }

      return {
        clientOrderId: item.order_id,
        status: 'PROCESSING',
        awb: null,
      };
    });
  }
  private async find(orderId: string) {
    const row = await this.orders.findOneBy({ clientOrderId: orderId });

    if (!row)
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });

    return row;
  }

  private existingOrder(row: OrderEntity, input: OrderInput) {
    const savedRequest = row.normalizedRequest as Partial<OrderInput>;
    const requestMatches =
      row.courierPartner === input.courier_partner.trim().toLowerCase() &&
      isDeepStrictEqual(savedRequest.payload, input.payload);

    if (!requestMatches) throw new IdempotencyConflictError();
    return this.view(row, true);
  }

  private logCourierFailure(
    orderId: string,
    courierPartner: string,
    requestId: string | undefined,
    code: string,
    error: unknown,
  ) {
    this.logger.error(
      JSON.stringify({
        order_id: orderId,
        courier_partner: courierPartner,
        request_id: requestId ?? null,
        error_type: code,
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );
  }

  private view(row: OrderEntity, idempotent: boolean) {
    return {
      order_id: row.clientOrderId,
      courier_partner: row.courierPartner,
      courier_order_id: row.courierOrderId,
      awb: row.awb,
      status: row.status,
      idempotent,
      ...(row.failureCode
        ? {
            error: {
              code: row.failureCode,
              message:
                row.failureCode === 'COURIER_OUTCOME_UNKNOWN'
                  ? 'Shipment outcome is unknown and requires reconciliation'
                  : 'Courier shipment could not be created',
            },
          }
        : {}),
    };
  }
}
