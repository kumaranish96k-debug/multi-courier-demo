import { Injectable } from '@nestjs/common';
import { ShipmentStatus } from '../../../database/enums/shipment-status.enum.js';
import { CourierAdapterProvider } from '../courier-adapter.decorator.js';
import {
  CourierAdapter,
  CourierRequestRecord,
  CourierResult,
  CreateShipmentInput,
  TrackResult,
} from '../courier.interface.js';

@Injectable()
@CourierAdapterProvider()
export class MockCourierAdapter implements CourierAdapter {
  readonly key = 'mock';

  prepareCreate(input: CreateShipmentInput): CourierRequestRecord {
    return {
      method: 'MOCK',
      path: '/mock/shipments',
      body: input,
    };
  }

  async create(
    input: CreateShipmentInput,
    request: CourierRequestRecord,
  ): Promise<CourierResult> {
    const courierOrderId = `MOCK-${input.order_id}`;
    const awb = `AWB-${input.order_id}`;
    const response = { id: courierOrderId, awb, status: 'CREATED' };
    return {
      courierOrderId,
      awb,
      status: ShipmentStatus.CREATED,
      request,
      response,
    };
  }

  async track(order: {
    courierOrderId: string | null;
    awb: string | null;
  }): Promise<TrackResult> {
    const raw = {
      id: order.courierOrderId,
      awb: order.awb,
      status: 'IN_TRANSIT',
    };
    return { status: ShipmentStatus.IN_TRANSIT, raw };
  }

  async cancel(order: { courierOrderId: string | null }): Promise<object> {
    return { id: order.courierOrderId, status: 'CANCELLED' };
  }
}
