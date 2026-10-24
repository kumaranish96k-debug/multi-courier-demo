import { SetMetadata } from '@nestjs/common';

export const COURIER_ADAPTER_PROVIDER = Symbol('COURIER_ADAPTER_PROVIDER');

/** Marks a Nest provider as discoverable by the courier adapter registry. */
export const CourierAdapterProvider = () =>
  SetMetadata(COURIER_ADAPTER_PROVIDER, true);
