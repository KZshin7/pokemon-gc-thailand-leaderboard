import test from "node:test";
import assert from "node:assert/strict";
import {
  ENTRIES_STORAGE_KEY,
  OWNER_STORAGE_KEY,
  getLocalOwnerId,
  loadLocalEntries,
  saveLocalEntry,
} from "./local-store.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("submission handler data saves a local entry without email or Firebase configuration", () => {
  const storage = memoryStorage();
  const ownerId = getLocalOwnerId(storage, () => "browser-owner");
  const entry = saveLocalEntry({
    storage,
    ownerId,
    fields: { playerName: "Pika", rating: "1842" },
    now: 100,
    createId: () => "entry-1",
  });

  assert.equal(entry.id, "entry-1");
  assert.equal(entry.ownerId, "browser-owner");
  assert.equal(entry.playerName, "Pika");
  assert.equal(entry.rating, 1842);
  assert.equal(entry.hasEvidence, false);
  assert.equal("email" in entry, false);
  assert.deepEqual(loadLocalEntries(storage), [entry]);
  assert.ok(storage.getItem(ENTRIES_STORAGE_KEY));
  assert.equal(storage.getItem(OWNER_STORAGE_KEY), "browser-owner");
});

test("local edit updates its own entry and keeps verification unverified", () => {
  const storage = memoryStorage();
  const ownerId = "browser-owner";
  const created = saveLocalEntry({
    storage,
    ownerId,
    fields: { playerName: "Pika", rating: "1842" },
    evidenceDataUrl: "data:image/jpeg;base64,photo",
    now: 100,
    createId: () => "entry-1",
  });
  const updated = saveLocalEntry({
    storage,
    ownerId,
    entryId: created.id,
    fields: { playerName: "Pikachu", rating: "1900" },
    now: 200,
  });

  assert.equal(updated.playerName, "Pikachu");
  assert.equal(updated.rating, 1900);
  assert.equal(updated.evidenceDataUrl, created.evidenceDataUrl);
  assert.equal(updated.revision, 2);
  assert.equal(updated.verificationStatus, "unverified");
  assert.equal(updated.createdAt, 100);
  assert.equal(updated.updatedAt, 200);
});

test("local store blocks edits from a different browser owner token and duplicate entries", () => {
  const storage = memoryStorage();
  const created = saveLocalEntry({
    storage,
    ownerId: "first-owner",
    fields: { playerName: "Pika", rating: "1842" },
    createId: () => "entry-1",
  });

  assert.throws(
    () => saveLocalEntry({
      storage,
      ownerId: "another-owner",
      entryId: created.id,
      fields: { playerName: "Imposter", rating: "1" },
    }),
    /only entries created in this browser profile/,
  );
  assert.throws(
    () => saveLocalEntry({
      storage,
      ownerId: "first-owner",
      fields: { playerName: "Second", rating: "2" },
    }),
    /already has an entry/,
  );
  assert.equal(loadLocalEntries(storage)[0].playerName, "Pika");
});

test("local storage quota failures are surfaced as a user-facing error", () => {
  const storage = memoryStorage();
  storage.setItem = () => {
    throw new Error("quota exceeded");
  };
  assert.throws(
    () => saveLocalEntry({
      storage,
      ownerId: "browser-owner",
      fields: { playerName: "Pika", rating: "1842" },
    }),
    /Browser storage is unavailable or full/,
  );
});
