import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  LANGUAGE_STORAGE_KEY,
  applyTranslations,
  loadLanguagePreference,
  normalizeLanguage,
  saveLanguagePreference,
  translate,
  translateEntryError,
  translations,
} from "./translations.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("English is the default language and persisted language preference is reused", () => {
  const storage = memoryStorage();
  assert.equal(loadLanguagePreference(storage), "en");
  saveLanguagePreference("th", storage);
  assert.equal(storage.getItem(LANGUAGE_STORAGE_KEY), "th");
  assert.equal(loadLanguagePreference(storage), "th");
  assert.equal(normalizeLanguage("unknown"), "en");
});

test("both languages include every dictionary key and translate the requested headline", () => {
  assert.deepEqual(Object.keys(translations.th).sort(), Object.keys(translations.en).sort());
  assert.equal(translate("en", "heroTitle"), "for THAILAND region only");
  assert.equal(translate("th", "heroTitle"), "สำหรับภูมิภาคประเทศไทยเท่านั้น");
  assert.notEqual(translate("en", "localOnlyDescription"), translate("th", "localOnlyDescription"));
  assert.notEqual(translate("en", "evidenceAwaitingCount"), translate("th", "evidenceAwaitingCount"));
  assert.notEqual(translate("en", "evidenceUnverified"), translate("th", "evidenceUnverified"));
});

test("static page translation and accessibility keys exist in both languages", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const keys = new Set();
  for (const match of html.matchAll(/data-i18n(?:-aria-label|-placeholder)?="([^"]+)"/g)) {
    keys.add(match[1]);
  }
  for (const key of keys) {
    assert.ok(translations.en[key], `English translation missing: ${key}`);
    assert.ok(translations.th[key], `Thai translation missing: ${key}`);
  }
  assert.match(html, /<h1[^>]*data-i18n="heroTitle">for THAILAND region only<\/h1>/);
  const entryForm = html.match(/<form id="entry-form"[\s\S]*?<\/form>/)?.[0];
  assert.ok(entryForm, "entry form exists");
  assert.doesNotMatch(entryForm, /type="email"|name="email"/);
  assert.doesNotMatch(html, /firebase|auth-form/i);
  assert.doesNotMatch(app, /firebase|type="email"|name="email"/i);
  assert.match(app, /getSupabaseConfig/);
  assert.match(app, /signInWithOAuth/);
  assert.match(app, /getMyEntry/);
  assert.match(html, /<button id="open-entry-dialog"/);
  assert.match(html, /<button id="submit-entry"[^>]*type="submit"/);
  assert.match(app, /form\.addEventListener\("submit"/);
});

test("applies Thai translations to visible content and accessible input labels", () => {
  const heading = { dataset: { i18n: "heroTitle" }, textContent: "" };
  const closeButton = {
    dataset: { i18nAriaLabel: "closeDialog" },
    setAttribute(name, value) { this[name] = value; },
  };
  const input = {
    dataset: { i18nPlaceholder: "ratingPlaceholder" },
    setAttribute(name, value) { this[name] = value; },
  };
  const root = {
    documentElement: {},
    title: "",
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") return [heading];
      if (selector === "[data-i18n-aria-label]") return [closeButton];
      if (selector === "[data-i18n-placeholder]") return [input];
      return [];
    },
  };

  applyTranslations("th", root);
  assert.equal(root.documentElement.lang, "th");
  assert.equal(root.title, translations.th.pageTitle);
  assert.equal(heading.textContent, translations.th.heroTitle);
  assert.equal(closeButton["aria-label"], translations.th.closeDialog);
  assert.equal(input.placeholder, translations.th.ratingPlaceholder);
});

test("validation errors and interpolated UI copy are translated", () => {
  assert.equal(
    translateEntryError("th", "Rating must be from 0 to 9,999 with no more than 3 decimal places."),
    translate("th", "ratingError"),
  );
  assert.equal(
    translateEntryError("en", "Failed to fetch"),
    translate("en", "cloudConnectionError"),
  );
  assert.equal(
    translate("th", "submittedOn", { date: "28 ก.ย. 2569" }),
    "ส่งเมื่อ 28 ก.ย. 2569",
  );
  assert.equal(
    translateEntryError("th", "You can edit only entries created in this browser profile."),
    translate("th", "onlyOwnEntry"),
  );
});
