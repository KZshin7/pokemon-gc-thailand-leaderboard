import { validateEntryFields } from "./entries.js";

export const ENTRIES_STORAGE_KEY = "thailand-challenge.entries.v1";
export const OWNER_STORAGE_KEY = "thailand-challenge.local-owner.v1";

export function getLocalOwnerId(storage, createId = defaultId) {
  let ownerId = storage.getItem(OWNER_STORAGE_KEY);
  if (!ownerId) {
    ownerId = createId();
    storage.setItem(OWNER_STORAGE_KEY, ownerId);
  }
  return ownerId;
}

export function loadLocalEntries(storage) {
  const serialized = storage.getItem(ENTRIES_STORAGE_KEY);
  if (!serialized) return [];

  const entries = JSON.parse(serialized);
  if (!Array.isArray(entries)) throw new Error("Saved entries are not in a valid format.");
  return entries.map(({ verificationStatus: _legacyVerificationStatus, ...entry }) => entry);
}

export function saveLocalEntry({
  storage,
  ownerId,
  fields,
  entryId = null,
  evidenceDataUrl = null,
  removeEvidence = false,
  now = Date.now(),
  createId = defaultId,
}) {
  const { playerName, rating } = validateEntryFields(fields);
  const entries = loadLocalEntries(storage);
  const existing = entryId
    ? entries.find((entry) => entry.id === entryId)
    : entries.find((entry) => entry.ownerId === ownerId);

  if (entryId && (!existing || existing.ownerId !== ownerId)) {
    throw new Error("You can edit only entries created in this browser profile.");
  }
  if (!entryId && existing) {
    throw new Error("This browser profile already has an entry. Use its edit button.");
  }

  const currentEvidence = existing?.evidenceDataUrl ?? null;
  const nextEvidence = evidenceDataUrl ?? (removeEvidence ? null : currentEvidence);
  const entry = {
    id: existing?.id ?? createId(),
    ownerId,
    region: "TH",
    playerName,
    rating,
    evidenceDataUrl: nextEvidence,
    hasEvidence: nextEvidence !== null,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const updatedEntries = existing
    ? entries.map((candidate) => candidate.id === existing.id ? entry : candidate)
    : [...entries, entry];

  try {
    storage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(updatedEntries));
  } catch {
    throw new Error("Browser storage is unavailable or full. Try a smaller photo and submit again.");
  }

  return entry;
}

function defaultId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
