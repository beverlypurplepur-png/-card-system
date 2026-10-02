import test from "ava";

import { CreateCardSystem1790812800000 } from "../../data/migrations/1790812800000-create-card-system";

test("Card System migration is isolated, additive and has no cascading deletes", async (t) => {
  const calls: unknown[][] = [];
  await CreateCardSystem1790812800000.up({
    $executeRawUnsafe: async (...args: unknown[]) => {
      calls.push(args);
      return 0;
    },
  } as never);
  const sql = calls.map((call) => String(call[0])).join("\n");
  t.true(sql.includes("CREATE SCHEMA IF NOT EXISTS card_system"));
  for (const table of [
    "decks",
    "cards",
    "manual_card_content",
    "affine_card_reference",
    "review_state",
    "legacy_id_map",
  ]) {
    t.true(sql.includes(`card_system.${table}`));
  }
  t.false(sql.includes("CASCADE"));
  t.true(sql.includes("card_kind IN ('manual', 'affine_ref')"));
  t.true(sql.includes("source_type IN ('page', 'frame')"));
});
