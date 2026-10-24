import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ShipmentStatus } from '../../../database/enums/shipment-status.enum.js';
import { CourierAdapterProvider } from '../courier-adapter.decorator.js';
import {
  CourierAdapter,
  CourierRequestRecord,
  CourierResult,
  CreateShipmentInput,
  TrackResult,
} from '../courier.interface.js';

const normalizeStatus = (value: unknown): ShipmentStatus => {
  const status = (typeof value === 'string' ? value : '')
    .toUpperCase()
    .replaceAll(' ', '_');
  const statuses: Record<string, ShipmentStatus> = {
    CREATED: ShipmentStatus.CREATED,
    BOOKED: ShipmentStatus.CREATED,
    PICKED_UP: ShipmentStatus.PICKED_UP,
    PICKUP: ShipmentStatus.PICKED_UP,
    IN_TRANSIT: ShipmentStatus.IN_TRANSIT,
    OUT_FOR_DELIVERY: ShipmentStatus.OUT_FOR_DELIVERY,
    DELIVERED: ShipmentStatus.DELIVERED,
    CANCELLED: ShipmentStatus.CANCELLED,
    CANCELED: ShipmentStatus.CANCELLED,
    FAILED: ShipmentStatus.FAILED,
  };
  return statuses[status] ?? ShipmentStatus.UNKNOWN;
};

@Injectable()
@CourierAdapterProvider()
export class UrbaneBoltAdapter implements CourierAdapter {
  readonly key = 'urbanebolt';
  private token?: string;
  private cookie?: string;
  private readonly http: AxiosInstance = axios.create({
    baseURL: process.env.URBANEBOLT_BASE_URL ?? 'https://uat.urbanebolt.in',
    timeout: Number(process.env.URBANEBOLT_TIMEOUT_MS ?? 10000),
  });

  private async authenticate(): Promise<void> {
    const username = process.env.URBANEBOLT_USERNAME;
    const password = process.env.URBANEBOLT_PASSWORD;
    if (!username || !password)
      throw new Error('UrbaneBolt credentials are not configured');

    const response = await this.http.post(
      process.env.URBANEBOLT_AUTH_PATH ?? '/api/v1/auth/getToken/',
      {
        username,
        password,
      },
      {
        headers: process.env.URBANEBOLT_COOKIE
          ? { Cookie: process.env.URBANEBOLT_COOKIE }
          : undefined,
      },
    );

    this.token = (
      response.data?.token ??
      response.data?.access_token ??
      response.data?.access ??
      response.headers.authorization ??
      ''
    )
      .toString()
      .replace(/^Bearer\s+/i, '');

    const setCookie = response.headers['set-cookie'];
    if (Array.isArray(setCookie) && setCookie.length > 0) {
      // Forward only cookie name/value pairs; attributes are response metadata.
      const cookies = new Map<string, string>();
      for (const value of (process.env.URBANEBOLT_COOKIE ?? '').split(';')) {
        const pair = value.trim();
        const separator = pair.indexOf('=');
        if (separator > 0) cookies.set(pair.slice(0, separator), pair);
      }
      for (const value of setCookie) {
        const pair = value.split(';', 1)[0].trim();
        const separator = pair.indexOf('=');
        if (separator > 0) cookies.set(pair.slice(0, separator), pair);
      }
      this.cookie = [...cookies.values()].join('; ');
    }

    if (!this.token)
      throw new Error('UrbaneBolt authentication returned no token');
  }

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    data?: object,
    retryable = true,
  ): Promise<T> {
    const maxRetries = Number(process.env.URBANEBOLT_RETRY_COUNT ?? 3);

    // Auth expiry gets one refresh; transient failures use the retry budget.
    let refreshed = false;
    let retries = 0;

    while (retries <= maxRetries) {
      try {
        if (!this.token) await this.authenticate();

        return (
          await this.http.request<T>({
            method,
            url: path,
            data,
            headers: {
              Authorization: `Bearer ${this.token}`,
              'Content-Type': 'application/json',
              ...(this.cookie || process.env.URBANEBOLT_COOKIE
                ? { Cookie: this.cookie ?? process.env.URBANEBOLT_COOKIE }
                : {}),
            },
          })
        ).data;
      } catch (error: any) {
        const status = error?.response?.status;

        if ((status === 401 || status === 403) && !refreshed) {
          this.token = undefined;
          this.cookie = undefined;
          refreshed = true;
          continue;
        }

        if (status && status < 500) throw new Error('COURIER_REJECTED');

        if (!retryable || retries >= maxRetries) throw error;

        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(250 * 2 ** retries, 4000)),
        );

        retries += 1;
      }
    }
    throw new Error('COURIER_UNAVAILABLE');
  }

  prepareCreate(input: CreateShipmentInput): CourierRequestRecord {
    const customerCode =
      process.env.URBANEBOLT_CUSTOMER_CODE || input.payload.customerCode;

    const body = [
      {
        ...input.payload,
        customerCode,
        orderNumber: input.order_id,
      },
    ];
    return {
      method: 'POST',
      path: process.env.URBANEBOLT_MANIFEST_PATH ?? '/api/v1/manifest/',
      body,
    };
  }

  async create(
    input: CreateShipmentInput,
    request: CourierRequestRecord,
  ): Promise<CourierResult> {
    // Manifest POST is not retried after an ambiguous outcome because the UAT
    // contract does not document an idempotency key or duplicate-order lookup.
    const response: any = await this.request(
      'post',
      request.path,
      request.body,
      false,
    );
    const item = Array.isArray(response) ? response[0] : response;

    return {
      courierOrderId: String(
        item?.orderNumber ?? item?.order_id ?? item?.id ?? input.order_id,
      ),
      awb:
        item?.awb ??
        item?.awbNumber ??
        item?.awb_number ??
        item?.tracking_number ??
        null,
      status: normalizeStatus(item?.status ?? 'CREATED'),
      request,
      response: response ?? {},
    };
  }

  async track(order: {
    courierOrderId: string | null;
    awb: string | null;
  }): Promise<TrackResult> {
    const awb = encodeURIComponent(order.awb ?? order.courierOrderId ?? '');

    const response: any = await this.request(
      'get',
      `${process.env.URBANEBOLT_TRACKING_PATH ?? '/api/v1/services/tracking-pub/'}?awb=${awb}`,
    );

    const item = Array.isArray(response) ? response[0] : response;
    return {
      status: normalizeStatus(item?.status ?? item?.current_status),
      raw: item ?? {},
    };
  }

  async cancel(order: {
    courierOrderId: string | null;
    awb: string | null;
  }): Promise<object> {
    return (await this.request(
      'post',
      process.env.URBANEBOLT_CANCELLATION_PATH ?? '/api/v1/services/cancel/',
      { awbs: order.awb },
    )) as object;
  }
}
