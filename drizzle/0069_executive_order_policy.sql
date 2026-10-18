CREATE TABLE "executive_order_policy_effects" (
  "order_id" integer PRIMARY KEY REFERENCES "executive_orders"("id") ON DELETE CASCADE,
  "policy_key" varchar(100) NOT NULL REFERENCES "nation_policy_definitions"("key"),
  "previous_value" jsonb NOT NULL,
  "new_value" jsonb NOT NULL
);
