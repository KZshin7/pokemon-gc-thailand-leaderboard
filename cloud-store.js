import { validateEntryFields } from "./entries.js";

const PUBLIC_ENTRY_FIELDS =
  "id,player_name,rating,has_evidence,created_at,updated_at";

export async function listPublicEntries(client) {
  const { data, error } = await client
    .from("leaderboard_entries")
    .select(PUBLIC_ENTRY_FIELDS)
    .order("rating", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapPublicEntry);
}

export async function getMyEntry(client) {
  const { data, error } = await client.rpc("get_my_leaderboard_entry");
  if (error) throw error;
  const ownEntry = data?.[0];
  return ownEntry ? { id: ownEntry.entry_id, evidencePath: ownEntry.evidence_path } : null;
}

export async function saveCloudEntry({
  client,
  userId,
  entryId = null,
  fields,
  evidenceBlob = null,
  existingEvidencePath = null,
  removeEvidence = false,
}) {
  const validated = validateEntryFields(fields);
  const nextEvidencePath = evidenceBlob
    ? `${userId}/${crypto.randomUUID()}.jpg`
    : removeEvidence
      ? null
      : existingEvidencePath;

  if (evidenceBlob) {
    const { error } = await client.storage
      .from("leaderboard-evidence")
      .upload(nextEvidencePath, evidenceBlob, {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (error) throw error;
  }

  const values = {
    player_name: validated.playerName,
    rating: validated.rating,
    evidence_path: nextEvidencePath,
  };
  const result = entryId
    ? await client
      .from("leaderboard_entries")
      .update(values)
      .eq("id", entryId)
      .select("id")
      .maybeSingle()
    : await client
      .from("leaderboard_entries")
      .insert(values)
      .select("id")
      .single();

  if (result.error || !result.data) {
    if (evidenceBlob) {
      const { error: cleanupError } = await client.storage
        .from("leaderboard-evidence")
        .remove([nextEvidencePath]);
      if (cleanupError) {
        throw new Error(
          `The entry could not be saved, and the uploaded photo could not be removed: ${cleanupError.message}`,
        );
      }
    }
    if (result.error) throw result.error;
    throw new Error("This entry could not be saved. Refresh the page and try again.");
  }

  if (existingEvidencePath && existingEvidencePath !== nextEvidencePath) {
    const { error } = await client.storage
      .from("leaderboard-evidence")
      .remove([existingEvidencePath]);
    if (error) {
      throw new Error(`The entry was saved, but the previous photo could not be removed: ${error.message}`);
    }
  }

  return result.data;
}

export async function createEvidenceUrl(client, evidencePath) {
  const { data, error } = await client.storage
    .from("leaderboard-evidence")
    .createSignedUrl(evidencePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

function mapPublicEntry(row) {
  return {
    id: row.id,
    playerName: row.player_name,
    rating: row.rating,
    hasEvidence: row.has_evidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
