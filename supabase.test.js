import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { listPublicEntries } from "./cloud-store.js";
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

test("public leaderboard query requests only public fields and excludes owner identity and evidence paths", async () => {
  let requestedFields = "";
  const row = {
    id: "entry-id",
    player_name: "Pika",
    rating: 1842,
    has_evidence: true,
    verification_status: "pending",
    verified_at: null,
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
    verificationStatus: "pending",
    verifiedAt: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  assert.doesNotMatch(requestedFields, /owner_id|email|evidence_path|reviewed_by/i);
});

test("migration restricts public fields and protects ownership, review state, and private evidence", async () => {
  const migration = await readFile(
    new URL("./supabase/migrations/202609280001_leaderboard.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /grant select \([\s\S]*id, player_name, rating, has_evidence, verification_status, verified_at, created_at, updated_at[\s\S]*\) on public\.leaderboard_entries to anon, authenticated/i);
  assert.doesNotMatch(migration, /grant select \([^)]*(?:owner_id|evidence_path|reviewed_by)/i);
  assert.match(migration, /with check \(owner_id = \(select auth\.uid\(\)\) and verification_status = 'pending'\)/i);
  assert.match(migration, /using \(owner_id = \(select auth\.uid\(\)\)\)[\s\S]*with check \(owner_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /new\.verification_status := 'pending'/i);
  assert.match(migration, /new\.owner_id := auth\.uid\(\)/i);
  assert.match(migration, /grant insert \(player_name, rating, evidence_path\)/i);
  assert.match(migration, /role' = 'leaderboard_reviewer'/i);
  assert.match(migration, /verification_status in \('pending', 'verified', 'rejected'\)/i);
  assert.match(migration, /values \('leaderboard-evidence', 'leaderboard-evidence', false, 1048576, array\['image\/jpeg'\]\)/i);
  assert.match(migration, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/i);
  assert.match(migration, /get_leaderboard_evidence_path_for_review/);
  assert.match(migration, /review_leaderboard_entry/);
});
