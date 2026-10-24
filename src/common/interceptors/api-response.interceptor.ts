import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<
  T,
  { success: true; data: T }
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ success: true; data: T }> {
    // Keep every successful route on the same public response contract.
    return next.handle().pipe(map((data: T) => ({ success: true, data })));
  }
}
