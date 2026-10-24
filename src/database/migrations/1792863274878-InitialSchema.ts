import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1792863274878 implements MigrationInterface {
  name = 'InitialSchema1792863274878';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('SUBMITTING', 'CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED', 'UNKNOWN', 'RECONCILIATION_REQUIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_batches" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "items" jsonb NOT NULL, "results" jsonb NOT NULL DEFAULT '[]', "status" character varying NOT NULL DEFAULT 'QUEUED', "request_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2b6b9ed5fdd6411e9f9c1d727f3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "client_order_id" character varying NOT NULL, "courier_partner" character varying NOT NULL, "courier_order_id" character varying, "awb" character varying, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'CREATED', "normalized_request" jsonb NOT NULL, "courier_request" jsonb, "courier_response" jsonb, "failure_code" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4717fea05a52eee586e633f83f" ON "orders"  ("client_order_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tracking_history_status_enum" AS ENUM('SUBMITTING', 'CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED', 'UNKNOWN', 'RECONCILIATION_REQUIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tracking_history" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "order_id" character varying NOT NULL, "status" "public"."tracking_history_status_enum" NOT NULL, "raw_payload" jsonb NOT NULL, "recorded_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5e58aa7bd8c7a6342010afd445a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cdf979f51f6720c6e85a4998ce" ON "tracking_history"  ("order_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cdf979f51f6720c6e85a4998ce"`,
    );
    await queryRunner.query(`DROP TABLE "tracking_history"`);
    await queryRunner.query(
      `DROP TYPE "public"."tracking_history_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4717fea05a52eee586e633f83f"`,
    );
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TABLE "order_batches"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
  }
}
