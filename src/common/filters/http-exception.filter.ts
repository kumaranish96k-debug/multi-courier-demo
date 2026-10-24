import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  BatchInputError,
  CourierOperationError,
  IdempotencyConflictError,
} from '../errors/order.errors.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const http = exception instanceof HttpException ? exception : null;
    const operation =
      exception instanceof CourierOperationError ? exception : null;
    const batchError = exception instanceof BatchInputError ? exception : null;
    const idempotencyConflict =
      exception instanceof IdempotencyConflictError ? exception : null;
    const status = operation
      ? HttpStatus.BAD_GATEWAY
      : batchError
        ? HttpStatus.BAD_REQUEST
        : idempotencyConflict
          ? HttpStatus.CONFLICT
          : (http?.getStatus() ?? HttpStatus.INTERNAL_SERVER_ERROR);
    const body: any = http?.getResponse();
    let code =
      operation?.code ??
      batchError?.code ??
      idempotencyConflict?.code ??
      (status === 400
        ? 'VALIDATION_ERROR'
        : status === 404
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR');
    let message =
      operation?.safeMessage ??
      batchError?.message ??
      idempotencyConflict?.message ??
      'Request could not be processed';
    let details: unknown;

    if (body && typeof body === 'object') {
      code = body.code ?? code;
      if (
        Array.isArray(body.message) &&
        body.message.length > 0 &&
        typeof body.message[0] === 'object'
      ) {
        details = body.message;
        message = 'Request validation failed';
      } else if (Array.isArray(body.message)) {
        details = body.message.map((m: string) => ({ message: m }));
        message = 'Request validation failed';
      } else {
        message = body.message ?? message;
        details = body.details;
      }
    }

    // Service-level courier errors are already logged with order context.
    // Log other failures here without recording bodies or credentials.
    if (!operation) {
      const requestBody = request.body;
      const safeBody =
        requestBody && typeof requestBody === 'object'
          ? (requestBody as Record<string, unknown>)
          : {};
      const context = {
        request_id: request.id,
        order_id:
          (safeBody.order_id as string | undefined) ??
          (request.params as Record<string, string> | undefined)?.id ??
          null,
        courier_partner:
          (safeBody.courier_partner as string | undefined) ?? null,
        method: request.method,
        url: request.url,
        error_type: code,
        status_code: status,
      };
      const error = exception instanceof Error ? exception : undefined;
      const entry = {
        ...context,
        ...(status >= 500 && error
          ? { error: error.message, stack: error.stack }
          : {}),
      };

      if (status >= 500) this.logger.error(JSON.stringify(entry));
      else this.logger.warn(JSON.stringify(entry));
    }

    response.status(status).send({
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        requestId: request.id,
      },
    });
  }
}
