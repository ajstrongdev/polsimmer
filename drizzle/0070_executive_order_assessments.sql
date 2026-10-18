ALTER TABLE "executive_order_effects" ADD COLUMN "assessed_effect" double precision;
CREATE TABLE "executive_order_assessments" (
  "order_id" integer NOT NULL REFERENCES "executive_orders"("id") ON DELETE CASCADE,
  "senator_id" integer NOT NULL REFERENCES "users"("id"),
  "effects" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("order_id", "senator_id")
);
-- Keep legacy vote records for historical orders; no new votes are accepted.
