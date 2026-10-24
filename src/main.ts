import 'reflect-metadata';
import {
  BadRequestException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import compress from '@fastify/compress';
import { constants as zlibConstants } from 'node:zlib';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor.js';

async function bootstrap() {
  const adapter = new FastifyAdapter({
    bodyLimit: Number(process.env.HTTP_BODY_LIMIT_BYTES ?? 1_048_576),
    trustProxy: process.env.TRUST_PROXY === 'true',
    requestIdHeader: 'x-request-id',
    genReqId: (request: {
      headers: Record<string, string | string[] | undefined>;
    }) => {
      const supplied = request.headers['x-request-id'];
      // Keep a valid caller ID for log correlation; replace malformed values.
      return typeof supplied === 'string' && /^[\w-]{1,128}$/.test(supplied)
        ? supplied
        : randomUUID();
    },
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    {
      bufferLogs: true,
      abortOnError: false,
    },
  );

  await app.register(compress, {
    global: true,
    threshold: Number(process.env.HTTP_COMPRESSION_THRESHOLD_BYTES ?? 1024),
    encodings: ['br', 'gzip', 'deflate'],
    zlibOptions: {
      level: Number(process.env.HTTP_COMPRESSION_LEVEL ?? 1),
    },
    brotliOptions: {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: Number(
          process.env.HTTP_BROTLI_QUALITY ?? 4,
        ),
      },
    },
  });

  app.enableShutdownHooks();

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: errors.map((error) => ({
            field: error.property,
            messages: Object.values(error.constraints ?? {}),
          })),
        }),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(new ApiResponseInterceptor());

  await app.listen(
    Number(process.env.PORT ?? 3000),
    process.env.HOST ?? '0.0.0.0',
  );
}

void bootstrap().catch((error: unknown) => {
  // A failed startup must cause the container/process to restart.
  console.error('Application failed to start', error);
  process.exitCode = 1;
});
