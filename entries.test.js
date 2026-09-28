import test from "node:test";
import assert from "node:assert/strict";
import {
  EVIDENCE_MIME_TYPE,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_DIMENSION,
  MAX_EVIDENCE_SOURCE_BYTES,
  getTopRatedEntry,
  validateCompressedEvidence,
  validateEntryFields,
  validateEvidenceFile,
} from "./entries.js";

const validFields = { playerName: "Pika", rating: "1842" };

test("validates integer ratings and up to three fractional digits", () => {
  assert.deepEqual(validateEntryFields(validFields), {
    playerName: "Pika",
    rating: 1842,
  });
  for (const rating of ["0", "1842.1", "1842.12", "1842.123", "9999", "9999.000", "9998.999"]) {
    assert.equal(validateEntryFields({ ...validFields, rating }).rating, Number(rating));
  }
  assert.equal(validateEntryFields({ ...validFields, rating: "1842,375" }).rating, 1842.375);
});

test("rejects empty or invalid player names and out-of-range or over-precision ratings", () => {
  for (const fields of [
    { ...validFields, playerName: " " },
    { ...validFields, playerName: "x".repeat(61) },
    { ...validFields, rating: "" },
    { ...validFields, rating: " " },
    { ...validFields, rating: "1842.1234" },
    { ...validFields, rating: "1842.0000" },
    { ...validFields, rating: "1842,1234" },
    { ...validFields, rating: "1,234.5" },
    { ...validFields, rating: "9999.001" },
    { ...validFields, rating: "1e3" },
    { ...validFields, rating: "-1" },
    { ...validFields, rating: "10000" },
  ]) {
    assert.throws(() => validateEntryFields(fields));
  }
});

test("accepts only JPEG, PNG, WebP source photos within the source-size limit", () => {
  assert.equal(validateEvidenceFile({ type: "image/png", size: 100 }).size, 100);
  assert.throws(() => validateEvidenceFile({ type: "image/gif", size: 100 }), /JPEG, PNG, or WebP/);
  assert.throws(
    () => validateEvidenceFile({ type: "image/jpeg", size: MAX_EVIDENCE_SOURCE_BYTES + 1 }),
    /10 MB/,
  );
});

test("only accepts compressed JPEG evidence at or below the Storage limit", () => {
  assert.equal(validateCompressedEvidence({ type: EVIDENCE_MIME_TYPE, size: MAX_EVIDENCE_BYTES }).size, MAX_EVIDENCE_BYTES);
  assert.throws(() => validateCompressedEvidence({ type: "image/png", size: 100 }), /JPEG/);
  assert.throws(() => validateCompressedEvidence({ type: "image/jpeg", size: MAX_EVIDENCE_BYTES + 1 }), /1 MB/);
});

test("selects the highest rating for the leaderboard spotlight", () => {
  const lower = { id: "lower", rating: 1200, createdAt: "2026-01-01T00:00:00.000Z" };
  const higher = { id: "higher", rating: 2400, createdAt: "2026-01-01T00:00:00.000Z" };
  assert.equal(getTopRatedEntry([]), null);
  assert.equal(getTopRatedEntry([lower, higher]).id, "higher");
});

test("sets the client resize dimension within the configured image cap", () => {
  assert.equal(MAX_EVIDENCE_DIMENSION, 1600);
});
