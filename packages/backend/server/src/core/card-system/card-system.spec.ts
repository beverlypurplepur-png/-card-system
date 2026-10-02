import test from 'ava';

import { CreateCardSystem1790812800000 } from '../../data/migrations/1790812800000-create-card-system';
import { SimplifyCardSystemDomain1790899200000 } from '../../data/migrations/1790899200000-simplify-card-system-domain';

test('Card System migration is isolated, additive and has no cascading deletes', async t => {
  const calls: unknown[][] = [];
  await CreateCardSystem1790812800000.up({
    $executeRawUnsafe: async (...args: unknown[]) => {
      calls.push(args);
      return 0;
    },
  } as never);
  const sql = calls.map(call => String(call[0])).join('\n');
  t.true(sql.includes('CREATE SCHEMA IF NOT EXISTS card_system'));
  for (const table of [
    'decks',
    'cards',
    'manual_card_content',
    'affine_card_reference',
    'review_state',
    'legacy_id_map',
  ]) {
    t.true(sql.includes(`card_system.${table}`));
  }
  t.false(sql.includes('CASCADE'));
  t.true(sql.includes("card_kind IN ('manual', 'affine_ref')"));
  t.true(sql.includes("source_type IN ('page', 'frame')"));
});

test('simplified Card domain is additive and keeps one permanent card id', async t => {
  const calls: unknown[][] = [];
  await SimplifyCardSystemDomain1790899200000.up({
    $executeRawUnsafe: async (...args: unknown[]) => {
      calls.push(args);
      return 0;
    },
  } as never);
  const sql = calls.map(call => String(call[0])).join('\n');
  for (const table of [
    'collections',
    'card_records',
    'card_collection_memberships',
  ]) {
    t.true(sql.includes(`card_system.${table}`));
  }
  t.true(sql.includes('card_id UUID PRIMARY KEY'));
  t.true(sql.includes('PRIMARY KEY (card_id, collection_id)'));
  t.true(sql.includes('FROM card_system.cards'));
  t.true(sql.includes('FROM card_system.decks'));
  t.false(sql.includes('DROP '));
  t.false(sql.includes('CASCADE'));
});
