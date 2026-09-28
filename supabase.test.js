import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { listPublicEntries, saveCloudEntry } from "./cloud-store.js";
import { getSupabaseConfig } from "./supabase-client.js";

test("Supabase configuration requires both a URL and anon key and rejects insecure remote URLs", () => {
  assert.equal(getSupabaseConfig({ VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "anon" }), null);
  assert.equal(getSupabaseConfig({ VITE_SUPABASE_URL: "https://project.supabase.co" }), null);
  assert.equal(getSupabaseConfig({
    VITE_SUPABASE_URL: "http://project.example",
    VITE_SUPABASE_ANON_KEY: "anon",
  }), null);
  assert.deepEqual(getSupabaseConfig({
    VITE_SUPABASE_URL: "https://project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon",
  }), {
    url: "https://project.supabase.co",
    anonKey: "anon",
  });
  assert.ok(getSupabaseConfig({
    VITE_SUPABASE_URL: "http://localhost:54321",
    VITE_SUPABASE_ANON_KEY: "local-anon",
  }));
});

test("public leaderboard query requests only name, rating, photo presence, and timestamps", async () => {
  let requestedFields = "";
  const row = {
    id: "entry-id",
    player_name: "Pika",
    rating: 1842,
    has_evidence: true,
    created_at: "2026-09-28T00:00:00Z",
    updated_at: "2026-09-28T00:00:00Z",
  };
  const query = {
    select(fields) {
      requestedFields = fields;
      return this;
    },
    order() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve({ data: [row], error: null }).then(resolve, reject);
    },
  };
  const entries = await listPublicEntries({ from: () => query });
  assert.deepEqual(entries[0], {
    id: row.id,
    playerName: row.player_name,
    rating: row.rating,
    hasEvidence: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  assert.equal(requestedFields, "id,player_name,rating,has_evidence,created_at,updated_at");
  assert.doesNotMatch(requestedFields, /owner_id|email|evidence_path|reviewed_by|verification_status/i);
});

test("cloud save accepts three-place ratings and rejects excess precision before writing", async () => {
  let inserted;
  const client = {
    from() {
      return {
        insert(values) {
          inserted = values;
          return this;
        },
        select() {
          return this;
        },
        async single() {
          return { data: { id: "saved-entry" }, error: null };
        },
      };
    },
  };
  await saveCloudEntry({
    client,
    userId: "auth-user",
    fields: { playerName: "Pika", rating: "1842.375" },
  });
  assert.equal(inserted.rating, 1842.375);
  await assert.rejects(
    saveCloudEntry({
      client,
      userId: "auth-user",
      fields: { playerName: "Pika", rating: "1842.1234" },
    }),
    /no more than 3 decimal places/,
  );
});

test("migration restricts public fields and protects ownership and private evidence", async () => {
  const migration = await readFile(
    new URL("./supabase/migrations/202609280001_leaderboard.sql", import.meta.url),
    "utf8",
  );
  const upgrade = await readFile(
    new URL("./supabase/migrations/202609280002_remove_entry_review.sql", import.meta.url),
    "utf8",
  );
  const allMigrations = `${migration}\n${upgrade}`;
  assert.match(allMigrations, /grant select \([\s\S]*id, player_name, rating, has_evidence, created_at, updated_at[\s\S]*\) on public\.leaderboard_entries to anon, authenticated/i);
  assert.doesNotMatch(allMigrations, /grant select \([^)]*(?:owner_id|evidence_path|reviewed_by)/i);
  assert.match(allMigrations, /with check \(owner_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(allMigrations, /using \(owner_id = \(select auth\.uid\(\)\)\)[\s\S]*with check \(owner_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(allMigrations, /new\.owner_id := auth\.uid\(\)/i);
  assert.match(allMigrations, /grant insert \(player_name, rating, evidence_path\)/i);
  assert.match(allMigrations, /rating numeric not null/i);
  assert.match(allMigrations, /rating between 0 and 9999 and rating = trunc\(rating, 3\)/i);
  assert.match(upgrade, /drop column if exists verification_status/i);
  assert.match(upgrade, /drop function if exists public\.review_leaderboard_entry/i);
  assert.doesNotMatch(migration, /create or replace function public\.(?:is_leaderboard_reviewer|review_leaderboard_entry|get_leaderboard_evidence_path_for_review)/i);
  assert.doesNotMatch(allMigrations, /create policy "Owners and reviewers can read evidence"/i);
  assert.match(migration, /values \('leaderboard-evidence', 'leaderboard-evidence', false, 1048576, array\['image\/jpeg'\]\)/i);
  assert.match(allMigrations, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/i);
  assert.match(allMigrations, /create policy "Owners can read evidence"/i);
});
