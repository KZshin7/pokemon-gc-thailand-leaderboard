import { prepareEvidenceImage } from "./evidence.js";
import { getTopRatedEntry, validateEntryFields } from "./entries.js";
import { getLocalOwnerId, loadLocalEntries, saveLocalEntry } from "./local-store.js";
import {
  applyTranslations,
  loadLanguagePreference,
  normalizeLanguage,
  saveLanguagePreference,
  translate,
  translateEntryError,
} from "./translations.js";

const form = document.querySelector("#entry-form");
const entryDialog = document.querySelector("#entry-dialog");
const openEntryDialogButton = document.querySelector("#open-entry-dialog");
const closeEntryDialogButton = document.querySelector("#close-entry-dialog");
const formTitle = document.querySelector("#form-title");
const entriesList = document.querySelector("#entries-list");
const entryCount = document.querySelector("#entry-count");
const reviewCount = document.querySelector("#review-count");
const topRatingStat = document.querySelector("#top-rating-stat");
const topRatingName = document.querySelector("#top-rating-name");
const topRatingStatus = document.querySelector("#top-rating-status");
const topRatingValue = document.querySelector("#top-rating-value");
const formMessage = document.querySelector("#form-message");
const appMessage = document.querySelector("#app-message");
const evidenceInput = document.querySelector("#evidence");
const selectedFileName = document.querySelector("#selected-file-name");
const currentEvidence = document.querySelector("#current-evidence");
const removeEvidenceLabel = document.querySelector("#remove-evidence-label");
const removeEvidence = document.querySelector("#remove-evidence");
const submitButton = document.querySelector("#submit-entry");
const submitLabel = document.querySelector("#submit-entry-label");
const cancelButton = document.querySelector("#cancel-edit");
const languageButtons = {
  en: document.querySelector("#language-en"),
  th: document.querySelector("#language-th"),
};

let entries = [];
let ownerId;
let editingId = null;
let dialogTrigger = openEntryDialogButton;
let language = "en";

try {
  language = loadLanguagePreference(window.localStorage);
} catch {
  language = "en";
}

applyTranslations(language);
updateLanguageButtons();
openEntryDialogButton.disabled = false;

try {
  ownerId = getLocalOwnerId(window.localStorage);
  entries = loadLocalEntries(window.localStorage);
  renderEntries();
} catch (error) {
  showMessage(appMessage, translateLocalError(language, error), true);
  renderEntries();
}

for (const [selectedLanguage, button] of Object.entries(languageButtons)) {
  button.addEventListener("click", () => setLanguage(selectedLanguage));
}

openEntryDialogButton.addEventListener("click", () => {
  resetEditor();
  openEntryDialog(openEntryDialogButton);
});

closeEntryDialogButton.addEventListener("click", () => entryDialog.close());
cancelButton.addEventListener("click", () => entryDialog.close());

entryDialog.addEventListener("click", (event) => {
  if (event.target === entryDialog) entryDialog.close();
});

entryDialog.addEventListener("close", () => {
  resetEditor();
  if (dialogTrigger.isConnected) dialogTrigger.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(formMessage);
  submitButton.disabled = true;

  try {
    const fields = {
      playerName: form.elements.playerName.value,
      rating: form.elements.rating.value,
    };
    validateEntryFields(fields);

    const selectedFile = evidenceInput.files?.[0];
    const evidenceDataUrl = selectedFile
      ? await blobToDataUrl(await prepareEvidenceImage(selectedFile))
      : null;
    const wasEditing = editingId !== null;
    saveLocalEntry({
      storage: window.localStorage,
      ownerId,
      fields,
      entryId: editingId,
      evidenceDataUrl,
      removeEvidence: removeEvidence.checked,
    });
    entries = loadLocalEntries(window.localStorage);
    renderEntries();
    resetEditor();
    if (entryDialog.open) entryDialog.close();
    showMessage(appMessage, translate(language, wasEditing ? "entryUpdated" : "entrySubmitted"));
  } catch (error) {
    showMessage(formMessage, translateLocalError(language, error), true);
  } finally {
    submitButton.disabled = false;
  }
});

evidenceInput.addEventListener("change", () => {
  selectedFileName.textContent = evidenceInput.files?.[0]?.name ?? translate(language, "noFileSelected");
});

function renderEntries() {
  entriesList.replaceChildren();
  const sortedEntries = [...entries].sort(
    (a, b) => b.rating - a.rating || timestampMillis(b.createdAt) - timestampMillis(a.createdAt),
  );
  const leader = getTopRatedEntry(entries);

  entryCount.textContent = String(entries.length);
  reviewCount.textContent = String(
    entries.filter((entry) => entry.hasEvidence).length,
  );

  if (!leader) {
    topRatingStat.textContent = "—";
    topRatingName.textContent = translate(language, "noEntriesYet");
    topRatingStatus.textContent = translate(language, "firstToAddRating");
    topRatingValue.textContent = "—";
  } else {
    const rating = Number(leader.rating).toLocaleString(language === "th" ? "th-TH" : "en");
    topRatingStat.textContent = rating;
    topRatingName.textContent = leader.playerName;
    topRatingStatus.textContent = statusText(leader);
    topRatingValue.textContent = rating;
  }

  if (sortedEntries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = translate(language, "firstThailandEntry");
    entriesList.append(empty);
  } else {
    for (const entry of sortedEntries) entriesList.append(renderEntryCard(entry));
  }
}

function renderEntryCard(entry) {
  const card = document.createElement("article");
  card.className = "entry-card";

  const heading = document.createElement("div");
  heading.className = "entry-heading";
  const name = document.createElement("h3");
  name.textContent = entry.playerName;
  heading.append(name);

  const rating = document.createElement("p");
  rating.className = "entry-rating";
  const ratingValue = document.createElement("span");
  ratingValue.textContent = Number(entry.rating).toLocaleString(language === "th" ? "th-TH" : "en");
  const ratingLabel = document.createElement("span");
  ratingLabel.className = "rating-label";
  ratingLabel.textContent = translate(language, "rating");
  rating.append(ratingValue, ratingLabel);

  const status = document.createElement("p");
  status.className = "entry-status";
  status.textContent = statusText(entry);

  const details = document.createElement("p");
  details.className = "entry-date";
  details.textContent = translate(language, "submittedOn", { date: formatDate(entry.createdAt) });
  card.append(heading, rating, status, details);

  if (entry.hasEvidence && entry.evidenceDataUrl) {
    const evidenceButton = document.createElement("button");
    evidenceButton.type = "button";
    evidenceButton.className = "edit-button";
    evidenceButton.textContent = translate(language, "viewEvidence");
    evidenceButton.addEventListener("click", () => {
      if (card.querySelector(".evidence-thumbnail")) return;
      const image = document.createElement("img");
      image.className = "evidence-thumbnail";
      image.src = entry.evidenceDataUrl;
      image.alt = translate(language, "evidenceAlt", { name: entry.playerName });
      card.append(image);
    });
    card.append(evidenceButton);
  }

  if (ownerId && entry.ownerId === ownerId) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "edit-button";
    editButton.textContent = translate(language, "editYourEntry");
    editButton.addEventListener("click", (event) => editEntry(entry, event.currentTarget));
    card.append(editButton);
  }
  return card;
}

function statusText(entry) {
  return translate(language, entry.hasEvidence ? "evidenceUnverified" : "noEvidenceUnverified");
}

function editEntry(entry, trigger) {
  if (!ownerId || entry.ownerId !== ownerId) {
    showMessage(formMessage, translate(language, "onlyOwnEntry"), true);
    return;
  }

  editingId = entry.id;
  dialogTrigger = trigger;
  form.elements.playerName.value = entry.playerName;
  form.elements.rating.value = String(entry.rating);
  formTitle.textContent = translate(language, "editDialogTitle");
  submitLabel.textContent = translate(language, "saveChanges");
  removeEvidenceLabel.hidden = !entry.evidenceDataUrl;
  removeEvidence.checked = false;
  currentEvidence.replaceChildren();
  if (entry.evidenceDataUrl) {
    const image = document.createElement("img");
    image.className = "evidence-thumbnail";
    image.src = entry.evidenceDataUrl;
    image.alt = translate(language, "currentEvidenceAlt");
    currentEvidence.append(image);
  }
  selectedFileName.textContent = entry.evidenceDataUrl
    ? translate(language, "existingEvidenceAttached")
    : translate(language, "noFileSelected");
  clearMessage(formMessage);
  openEntryDialog(trigger, form.elements.playerName);
}

function openEntryDialog(trigger, initialFocus) {
  dialogTrigger = trigger;
  entryDialog.showModal();
  (initialFocus ?? form.elements.playerName).focus();
}

function resetEditor() {
  editingId = null;
  form.reset();
  formTitle.textContent = translate(language, "entryDialogTitle");
  submitLabel.textContent = translate(language, "submitEntry");
  removeEvidenceLabel.hidden = true;
  removeEvidence.checked = false;
  selectedFileName.textContent = translate(language, "evidenceFileHint");
  currentEvidence.replaceChildren();
  clearMessage(formMessage);
}

function updateLanguageButtons() {
  for (const [selectedLanguage, button] of Object.entries(languageButtons)) {
    button.setAttribute("aria-pressed", String(language === selectedLanguage));
  }
}

function setLanguage(selectedLanguage) {
  language = normalizeLanguage(selectedLanguage);
  applyTranslations(language);
  updateLanguageButtons();
  renderEntries();
  clearMessage(appMessage);
  clearMessage(formMessage);
  if (editingId !== null) {
    formTitle.textContent = translate(language, "editDialogTitle");
    submitLabel.textContent = translate(language, "saveChanges");
  }
  try {
    saveLanguagePreference(language, window.localStorage);
  } catch {
    showMessage(appMessage, translate(language, "languageSaveError"), true);
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? translate(language, "dateUnavailable")
    : new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en", { dateStyle: "medium" }).format(date);
}

function timestampMillis(value) {
  return typeof value === "number" ? value : Date.parse(value) || 0;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(new Error("The selected evidence image could not be read.")));
    reader.readAsDataURL(blob);
  });
}

function translateLocalError(selectedLanguage, error) {
  const message = error?.message ?? "";
  const translated = translateEntryError(selectedLanguage, message);
  return translated === message ? translate(selectedLanguage, "localSaveError", { error: message }) : translated;
}

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("message-error", isError);
}

function clearMessage(element) {
  element.textContent = "";
  element.classList.remove("message-error");
}
