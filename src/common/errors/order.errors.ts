export class CourierOperationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }

  get safeMessage(): string {
    if (this.code === 'COURIER_REQUEST_REJECTED') {
      return 'Courier rejected the shipment request';
    }
    if (this.code === 'COURIER_OUTCOME_UNKNOWN') {
      return 'Shipment outcome is unknown and requires reconciliation';
    }
    if (this.code === 'COURIER_CONFIGURATION_ERROR') {
      return 'Courier integration is not configured correctly';
    }
    return 'Courier is temporarily unavailable';
  }
}

export class BatchInputError extends Error {
  readonly code = 'INVALID_BATCH';

  constructor(message: string) {
    super(message);
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';

  constructor() {
    super('order_id was already used with different order data');
  }
}
