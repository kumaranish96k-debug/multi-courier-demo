import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { COURIER_ADAPTER_PROVIDER } from './courier-adapter.decorator.js';
import { CourierAdapter } from './courier.interface.js';

@Injectable()
export class CouriersService implements OnModuleInit {
  private readonly adapters = new Map<string, CourierAdapter>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    for (const provider of this.discovery.getProviders()) {
      const providerType = provider.metatype;
      if (
        !providerType ||
        !this.reflector.get<boolean>(COURIER_ADAPTER_PROVIDER, providerType)
      ) {
        continue;
      }

      const adapter = provider.instance;
      if (!this.isCourierAdapter(adapter)) {
        throw new Error(
          `Provider ${providerType.name} is marked as a courier adapter but does not implement CourierAdapter`,
        );
      }

      const key = adapter.key.trim().toLowerCase();
      if (!key) {
        throw new Error(
          `Courier adapter ${providerType.name} has an empty key`,
        );
      }
      if (this.adapters.has(key)) {
        throw new Error(`Duplicate courier adapter key: ${key}`);
      }

      this.adapters.set(key, adapter);
    }

    if (this.adapters.size === 0) {
      throw new Error('No courier adapters were registered with Nest');
    }
  }

  get(partner: string): CourierAdapter {
    const adapter = this.adapters.get(partner.trim().toLowerCase());
    if (!adapter) {
      throw new BadRequestException({
        code: 'UNKNOWN_COURIER',
        message: 'Unsupported courier_partner',
        details: { supported_couriers: [...this.adapters.keys()] },
      });
    }
    return adapter;
  }

  private isCourierAdapter(value: unknown): value is CourierAdapter {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<CourierAdapter>;
    return (
      typeof candidate.key === 'string' &&
      typeof candidate.prepareCreate === 'function' &&
      typeof candidate.create === 'function' &&
      typeof candidate.track === 'function' &&
      typeof candidate.cancel === 'function'
    );
  }
}
