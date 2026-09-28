export const MAX_EVIDENCE_SOURCE_BYTES = 10_000_000;
export const MAX_EVIDENCE_BYTES = 1_000_000;
export const MAX_EVIDENCE_DIMENSION = 1600;
export const EVIDENCE_MIME_TYPE = "image/jpeg";
export const ALLOWED_EVIDENCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateEntryFields(fields) {
  const playerName = String(fields.playerName ?? "").trim();
  const ratingValue = fields.rating;
  const enteredRating = String(ratingValue ?? "").trim();
  const ratingText = enteredRating.replace(",", ".");
  const rating = Number(ratingText);

  if (!playerName || playerName.length > 60) {
    throw new Error("Enter a player name up to 60 characters.");
  }
  if (
    !/^\d+(?:\.\d{1,3})?$/.test(ratingText) ||
    !Number.isFinite(rating) ||
    rating < 0 ||
    rating > 9999
  ) {
    throw new Error("Rating must be from 0 to 9,999 with no more than 3 decimal places.");
  }

  return { playerName, rating };
}

export function validateEvidenceFile(file) {
  if (!ALLOWED_EVIDENCE_TYPES.has(file.type)) {
    throw new Error("Evidence must be a JPEG, PNG, or WebP image.");
  }
  if (file.size > MAX_EVIDENCE_SOURCE_BYTES) {
    throw new Error("Evidence source images must be 10 MB or smaller.");
  }
  return file;
}

export function validateCompressedEvidence(blob) {
  if (blob.type !== EVIDENCE_MIME_TYPE) {
    throw new Error("Compressed evidence must be a JPEG image.");
  }
  if (blob.size === 0 || blob.size > MAX_EVIDENCE_BYTES) {
    throw new Error("Compressed evidence must be larger than 0 bytes and no more than 1 MB.");
  }
  return blob;
}

export function getTopRatedEntry(entries) {
  return [...entries].sort(
    (a, b) =>
      b.rating - a.rating ||
      getTimestamp(b.createdAt) - getTimestamp(a.createdAt),
  )[0] ?? null;
}

function getTimestamp(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
