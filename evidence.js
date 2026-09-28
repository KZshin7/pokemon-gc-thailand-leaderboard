import {
  EVIDENCE_MIME_TYPE,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_DIMENSION,
  validateCompressedEvidence,
  validateEvidenceFile,
} from "./entries.js";

export async function prepareEvidenceImage(file) {
  validateEvidenceFile(file);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("The selected evidence image could not be compressed.");
  }
  try {
    const scale = Math.min(1, MAX_EVIDENCE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser cannot resize the selected evidence image.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.84, 0.72, 0.6, 0.48, 0.36]) {
      const compressed = await toJpegBlob(canvas, quality);
      if (compressed.size <= MAX_EVIDENCE_BYTES) {
        return validateCompressedEvidence(compressed);
      }
    }
    throw new Error("Compressed evidence must be larger than 0 bytes and no more than 1 MB.");
  } finally {
    bitmap.close();
  }
}

function toJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The selected evidence image could not be compressed."));
      },
      EVIDENCE_MIME_TYPE,
      quality,
    );
  });
}
