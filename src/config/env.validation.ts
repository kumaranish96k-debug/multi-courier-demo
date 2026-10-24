import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  HOST: Joi.string().default('0.0.0.0'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),

  DATABASE_HOST: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('localhost'),
  }),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_USER: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('postgres'),
  }),
  DATABASE_PASSWORD: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('postgres'),
  }),
  DATABASE_NAME: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('multi_courier'),
  }),
  DATABASE_POOL_SIZE: Joi.number().integer().min(1).max(100).default(10),
  DATABASE_CONNECT_TIMEOUT_MS: Joi.number().integer().min(100).default(5000),

  REDIS_HOST: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default('localhost'),
  }),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  HTTP_BODY_LIMIT_BYTES: Joi.number().integer().min(1024).default(1048576),
  HTTP_COMPRESSION_THRESHOLD_BYTES: Joi.number()
    .integer()
    .min(256)
    .default(1024),
  HTTP_COMPRESSION_LEVEL: Joi.number().integer().min(1).max(9).default(1),
  HTTP_BROTLI_QUALITY: Joi.number().integer().min(0).max(11).default(4),
  TRUST_PROXY: Joi.boolean().default(false),

  BULK_MAX_ORDERS: Joi.number().integer().min(1).max(100).default(100),
  BULK_CONCURRENCY: Joi.number().integer().min(1).max(100).default(10),

  URBANEBOLT_BASE_URL: Joi.string().uri().default('https://uat.urbanebolt.in'),
  URBANEBOLT_AUTH_PATH: Joi.string().default('/api/v1/auth/getToken/'),
  URBANEBOLT_MANIFEST_PATH: Joi.string().default('/api/v1/manifest/'),
  URBANEBOLT_TRACKING_PATH: Joi.string().default(
    '/api/v1/services/tracking-pub/',
  ),
  URBANEBOLT_CANCELLATION_PATH: Joi.string().default(
    '/api/v1/services/cancel/',
  ),
  URBANEBOLT_CUSTOMER_CODE: Joi.string().allow('').optional(),
  URBANEBOLT_TIMEOUT_MS: Joi.number().integer().min(100).default(10000),
  URBANEBOLT_RETRY_COUNT: Joi.number().integer().min(0).max(10).default(3),
  URBANEBOLT_USERNAME: Joi.string().optional(),
  URBANEBOLT_PASSWORD: Joi.string().optional(),
  URBANEBOLT_COOKIE: Joi.string().allow('').optional(),
}).unknown(true);
