CREATE TABLE "executive_orders" (
  "id" serial PRIMARY KEY,
  "president_id" integer NOT NULL REFERENCES "users"("id"),
  "title" varchar(160) NOT NULL,
  "stat_key" varchar(100) NOT NULL REFERENCES "nation_stat_definitions"("key"),
  "effect" integer NOT NULL,
  "applied_change" double precision NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "cancelled_at" timestamp
);
CREATE TABLE "executive_order_votes" (
  "order_id" integer NOT NULL REFERENCES "executive_orders"("id") ON DELETE CASCADE,
  "senator_id" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("order_id", "senator_id")
);
ALTER TABLE "nation_changes" ALTER COLUMN "bill_id" DROP NOT NULL;
ALTER TABLE "nation_changes" ADD COLUMN "executive_order_id" integer REFERENCES "executive_orders"("id");
