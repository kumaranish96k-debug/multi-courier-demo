import { ShipmentStatus } from '../../database/enums/shipment-status.enum.js';

export interface CreateShipmentInput {
  order_id: string;
  payload: Record<string, any>;
}

export interface CourierRequestRecord {
  method: 'GET' | 'POST' | 'MOCK';
  path: string;
  body?: object;
}

export interface CourierResult {
  courierOrderId: string | null;
  awb: string | null;
  status: ShipmentStatus;
  request: CourierRequestRecord;
  response: object;
}

export interface TrackResult {
  status: ShipmentStatus;
  raw: object;
}

export interface CourierAdapter {
  readonly key: string;
  prepareCreate(input: CreateShipmentInput): CourierRequestRecord;

  create(
    input: CreateShipmentInput,
    request: CourierRequestRecord,
  ): Promise<CourierResult>;

  track(order: {
    courierOrderId: string | null;
    awb: string | null;
  }): Promise<TrackResult>;

  cancel(order: {
    courierOrderId: string | null;
    awb: string | null;
  }): Promise<object>;
}
