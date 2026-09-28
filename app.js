import { prepareEvidenceImage } from "./evidence.js";
import { filterRankedEntries, getRankedEntries, getTopRatedEntry, validateEntryFields } from "./entries.js";
import { getLocalOwnerId, loadLocalEntries, saveLocalEntry } from "./local-store.js";
import {
  createEvidenceUrl,
  getMyEntry,
  listPublicEntries,
  saveCloudEntry,
} from "./cloud-store.js";
import { createSupabaseClient, getSupabaseConfig } from "./supabase-client.js";
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
const entryFilters = [...document.querySelectorAll("[data-entry-filter]")];
const filterResultCount = document.querySelector("#filter-result-count");
const entryCount = document.querySelector("#entry-count");
const photoEntryCount = document.querySelector("#photo-entry-count");
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
const signInButton = document.querySelector("#sign-in-google");
const signOutButton = document.querySelector("#sign-out");
const dialogSignInButton = document.querySelector("#dialog-sign-in");
const authStatus = document.querySelector("#auth-status");
const authRequired = document.querySelector("#auth-required");
const authMessage = document.querySelector("#auth-message");
const prototypeNotice = document.querySelector(".prototype-notice");
const noticeTitle = document.querySelector("#notice-title");
const noticeDescription = document.querySelector("#notice-description");
const entryFormDescription = document.querySelector("#form-description");
const privacyNote = document.querySelector("#privacy-note");
const languageButtons = {
  en: document.querySelector("#language-en"),
  th: document.querySelector("#language-th"),
};

let entries = [];
let ownerId;
let activeUser = null;
let myCloudEntry = null;
let entryFilter = "all";
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

const supabaseConfig = getSupabaseConfig();
const supabase = supabaseConfig ? createSupabaseClient(supabaseConfig) : null;
setApplicationMode();

if (supabase) {
  void initializeCloud();
} else {
  try {
    ownerId = getLocalOwnerId(window.localStorage);
    entries = loadLocalEntries(window.localStorage);
  } catch (error) {
    showMessage(appMessage, translateLocalError(language, error), true);
  }
  renderEntries();
}

for (const [selectedLanguage, button] of Object.entries(languageButtons)) {
  button.addEventListener("click", () => setLanguage(selectedLanguage));
}
for (const button of entryFilters) {
  button.addEventListener("click", () => {
    entryFilter = button.dataset.entryFilter;
    renderEntries();
  });
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
  if (supabase && !activeUser) {
    showMessage(formMessage, translate(language, "signInRequired"), true);
    return;
  }
  clearMessage(formMessage);
  submitButton.disabled = true;

  try {
    const fields = {
      playerName: form.elements.playerName.value,
      rating: form.elements.rating.value,
    };
    validateEntryFields(fields);

    const selectedFile = evidenceInput.files?.[0];
    const wasEditing = editingId !== null;
    if (supabase && activeUser) {
      const evidenceBlob = selectedFile ? await prepareEvidenceImage(selectedFile) : null;
      await saveCloudEntry({
        client: supabase,
        userId: activeUser.id,
        fields,
        entryId: editingId,
        evidenceBlob,
        existingEvidencePath: myCloudEntry?.evidencePath ?? null,
        removeEvidence: removeEvidence.checked,
      });
      await refreshCloudEntries();
    } else {
      const evidenceDataUrl = selectedFile
        ? await blobToDataUrl(await prepareEvidenceImage(selectedFile))
        : null;
      saveLocalEntry({
        storage: window.localStorage,
        ownerId,
        fields,
        entryId: editingId,
        evidenceDataUrl,
        removeEvidence: removeEvidence.checked,
      });
      entries = loadLocalEntries(window.localStorage);
    }
    renderEntries();
    resetEditor();
    if (entryDialog.open) entryDialog.close();
    showMessage(appMessage, translate(
      language,
      supabase
        ? (wasEditing ? "entryUpdatedCloud" : "entrySubmittedCloud")
        : (wasEditing ? "entryUpdated" : "entrySubmitted"),
    ));
  } catch (error) {
    showMessage(formMessage, translateLocalError(language, error), true);
  } finally {
    submitButton.disabled = false;
  }
});

evidenceInput.addEventListener("change", () => {
  selectedFileName.textContent = evidenceInput.files?.[0]?.name ?? translate(language, "noFileSelected");
});

signInButton.addEventListener("click", () => void signInWithGoogle());
dialogSignInButton.addEventListener("click", () => void signInWithGoogle());
signOutButton.addEventListener("click", () => void signOut());

function renderEntries() {
  entriesList.replaceChildren();
  const rankedEntries = getRankedEntries(entries);
  const filteredEntries = filterRankedEntries(rankedEntries, entryFilter);
  const leader = getTopRatedEntry(entries);

  entryCount.textContent = String(entries.length);
  photoEntryCount.textContent = String(entries.filter((entry) => entry.hasEvidence).length);
  filterResultCount.textContent = translate(language, "filterResultCount", {
    shown: Number(filteredEntries.length).toLocaleString(language === "th" ? "th-TH" : "en"),
    total: Number(entries.length).toLocaleString(language === "th" ? "th-TH" : "en"),
  });
  updateEntryFilters();

  if (!leader) {
    topRatingStat.textContent = "—";
    topRatingName.textContent = translate(language, "noEntriesYet");
    topRatingStatus.textContent = translate(language, "firstToAddRating");
    topRatingValue.textContent = "—";
  } else {
    const rating = Number(leader.rating).toLocaleString(language === "th" ? "th-TH" : "en");
    topRatingStat.textContent = rating;
    topRatingName.textContent = leader.playerName;
    topRatingStatus.textContent = translate(language, "highestRatingListed");
    topRatingValue.textContent = rating;
  }

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = translate(language, "firstThailandEntry");
    entriesList.append(empty);
  } else if (filteredEntries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = translate(
      language,
      entryFilter === "with-photo" ? "noEntriesWithPhoto" : "noEntriesWithoutPhoto",
    );
    entriesList.append(empty);
  } else {
    for (const { entry, rank } of filteredEntries) {
      entriesList.append(renderEntryCard(entry, rank));
    }
  }
}

function updateEntryFilters() {
  const counts = {
    all: entries.length,
    "with-photo": entries.filter((entry) => entry.hasEvidence).length,
    "without-photo": entries.filter((entry) => !entry.hasEvidence).length,
  };
  for (const button of entryFilters) {
    const filter = button.dataset.entryFilter;
    button.setAttribute("aria-pressed", String(entryFilter === filter));
    button.textContent = translate(language, `filter${filterKey(filter)}`, {
      count: Number(counts[filter]).toLocaleString(language === "th" ? "th-TH" : "en"),
    });
  }
}

function filterKey(filter) {
  return filter === "with-photo" ? "WithPhoto" : filter === "without-photo" ? "WithoutPhoto" : "All";
}

function renderEntryCard(entry, rank) {
  const card = document.createElement("article");
  card.className = "entry-card";
  card.setAttribute("aria-label", translate(language, "rankedEntryLabel", {
    rank: Number(rank).toLocaleString(language === "th" ? "th-TH" : "en"),
    name: entry.playerName,
  }));

  const position = document.createElement("span");
  position.className = "entry-rank";
  position.setAttribute("aria-label", translate(language, "rankLabel", {
    rank: Number(rank).toLocaleString(language === "th" ? "th-TH" : "en"),
  }));
  position.textContent = Number(rank).toLocaleString(language === "th" ? "th-TH" : "en");

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

  const details = document.createElement("p");
  details.className = "entry-date";
  details.textContent = translate(language, "submittedOn", { date: formatDate(entry.createdAt) });
  const photoPresence = document.createElement("p");
  photoPresence.className = "entry-photo-presence";
  photoPresence.textContent = translate(language, entry.hasEvidence ? "hasPhoto" : "noPhoto");
  card.append(position, heading, rating, photoPresence, details);

  if (entry.hasEvidence && (entry.evidenceDataUrl || (supabase && entry.isMine))) {
    const evidenceButton = document.createElement("button");
    evidenceButton.type = "button";
    evidenceButton.className = "edit-button";
    evidenceButton.textContent = translate(language, "viewEvidence");
    evidenceButton.addEventListener("click", () => void showEvidence(entry, card));
    card.append(evidenceButton);
  }

  if ((supabase && entry.isMine) || (!supabase && ownerId && entry.ownerId === ownerId)) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "edit-button";
    editButton.textContent = translate(language, "editYourEntry");
    editButton.addEventListener("click", (event) => editEntry(entry, event.currentTarget));
    card.append(editButton);
  }
  return card;
}

function editEntry(entry, trigger) {
  const isOwnEntry = supabase
    ? entry.isMine && activeUser !== null
    : ownerId && entry.ownerId === ownerId;
  if (!isOwnEntry) {
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
  } else if (supabase && myCloudEntry?.evidencePath) {
    void showCurrentCloudEvidence(myCloudEntry.evidencePath);
  }
  selectedFileName.textContent = (entry.evidenceDataUrl || (supabase && myCloudEntry?.evidencePath))
    ? translate(language, "existingEvidenceAttached")
    : translate(language, "noFileSelected");
  if (supabase) {
    removeEvidenceLabel.hidden = !myCloudEntry?.evidencePath;
  }
  clearMessage(formMessage);
  openEntryDialog(trigger, form.elements.playerName);
}

function openEntryDialog(trigger, initialFocus) {
  dialogTrigger = trigger;
  entryDialog.showModal();
  (initialFocus ?? (supabase && !activeUser ? dialogSignInButton : form.elements.playerName)).focus();
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
  setFormAuthenticationState();
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
  setApplicationMode();
  setFormAuthenticationState();
  renderEntries();
  clearMessage(appMessage);
  clearMessage(formMessage);
  clearMessage(authMessage);
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

function setApplicationMode() {
  if (supabase) {
    noticeTitle.textContent = translate(language, "cloudModeTitle");
    noticeDescription.textContent = translate(language, "cloudModeDescription");
    entryFormDescription.textContent = translate(language, "cloudFormDescription");
    privacyNote.textContent = translate(language, "cloudPrivacyNote");
    signInButton.hidden = Boolean(activeUser);
    signOutButton.hidden = !activeUser;
    authStatus.textContent = activeUser ? translate(language, "signedInPrivate") : "";
    prototypeNotice.classList.add("cloud-notice");
  } else {
    noticeTitle.textContent = translate(language, "localOnlyTitle");
    noticeDescription.textContent = translate(language, "localOnlyDescription");
    entryFormDescription.textContent = translate(language, "formDescription");
    privacyNote.textContent = translate(language, "privacyNote");
    signInButton.hidden = true;
    signOutButton.hidden = true;
    authStatus.textContent = "";
    prototypeNotice.classList.remove("cloud-notice");
  }
}

function setFormAuthenticationState() {
  authRequired.hidden = !supabase || Boolean(activeUser);
  form.hidden = Boolean(supabase && !activeUser);
}

async function initializeCloud() {
  setFormAuthenticationState();
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await updateAuthState(data.session?.user ?? null);
    supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        void updateAuthState(session?.user ?? null).catch((error) => {
          showMessage(appMessage, translateLocalError(language, error), true);
        });
      }, 0);
    });
    supabase
      .channel("leaderboard-entries")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "leaderboard_entries",
      }, () => {
        void refreshCloudEntries().catch((error) => {
          showMessage(appMessage, translateLocalError(language, error), true);
        });
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          showMessage(appMessage, translate(language, "liveUpdatesUnavailable"), true);
        }
      });
  } catch (error) {
    entries = [];
    renderEntries();
    showMessage(appMessage, translateLocalError(language, error), true);
  }
}

async function updateAuthState(user) {
  activeUser = user;
  myCloudEntry = null;
  setApplicationMode();
  setFormAuthenticationState();
  await refreshCloudEntries();
}

async function refreshCloudEntries() {
  if (!supabase) return;
  const [publicEntries, ownEntry] = await Promise.all([
    listPublicEntries(supabase),
    activeUser ? getMyEntry(supabase) : Promise.resolve(null),
  ]);
  myCloudEntry = ownEntry;
  entries = publicEntries.map((entry) => ({
    ...entry,
    isMine: entry.id === ownEntry?.id,
    ...(entry.id === ownEntry?.id ? { evidencePath: ownEntry.evidencePath } : {}),
  }));
  renderEntries();
}

async function signInWithGoogle() {
  if (!supabase) return;
  const messageTarget = entryDialog.open ? authMessage : appMessage;
  clearMessage(messageTarget);
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (error) showMessage(messageTarget, translateLocalError(language, error), true);
  } catch (error) {
    showMessage(messageTarget, translateLocalError(language, error), true);
  }
}

async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) showMessage(appMessage, translateLocalError(language, error), true);
  } catch (error) {
    showMessage(appMessage, translateLocalError(language, error), true);
  }
}

async function showEvidence(entry, card) {
  if (card.querySelector(".evidence-thumbnail")) return;
  try {
    let evidenceUrl;
    if (entry.evidenceDataUrl) {
      evidenceUrl = entry.evidenceDataUrl;
    } else {
      const path = entry.isMine ? myCloudEntry?.evidencePath : null;
      if (!path) throw new Error("No photo evidence is available for this entry.");
      evidenceUrl = await createEvidenceUrl(supabase, path);
    }
    const image = document.createElement("img");
    image.className = "evidence-thumbnail";
    image.src = evidenceUrl;
    image.alt = translate(language, "evidenceAlt", { name: entry.playerName });
    card.append(image);
  } catch (error) {
    showMessage(appMessage, translateLocalError(language, error), true);
  }
}

async function showCurrentCloudEvidence(evidencePath) {
  try {
    const image = document.createElement("img");
    image.className = "evidence-thumbnail";
    image.src = await createEvidenceUrl(supabase, evidencePath);
    image.alt = translate(language, "currentEvidenceAlt");
    currentEvidence.replaceChildren(image);
  } catch (error) {
    showMessage(formMessage, translateLocalError(language, error), true);
  }
}

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("message-error", isError);
}

function clearMessage(element) {
  element.textContent = "";
  element.classList.remove("message-error");
}
