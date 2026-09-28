import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("static page has sharing metadata and an explicit setup/demo state", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /<meta name="description"/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /<link rel="icon"[^>]+href="\.\/favicon\.svg"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /id="notice-description"[^>]+data-i18n="localOnlyDescription"/);
  assert.match(html, /name="rating" type="text" inputmode="decimal" maxlength="8" pattern="\[0-9\]\+\(\[\.,\]\[0-9\]\{1,3\}\)\?"/);
  assert.match(html, /id="leaderboard-title"/);
  assert.match(html, /id="entries-list" class="entries-list" aria-live="polite"/);
  assert.match(html, /data-entry-filter="all"/);
  assert.match(html, /data-entry-filter="with-photo"/);
  assert.match(html, /data-entry-filter="without-photo"/);
  assert.doesNotMatch(html, /verification status|unverified|reviewer/i);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:assets|app\.js|styles\.css|favicon)/);
});

test("Pages workflow tests pull requests and deploys only successful main pushes", async () => {
  const workflow = await readFile(new URL("./.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /pull_request:[\s\S]*branches:\s*\n\s+- main/);
  assert.match(workflow, /push:[\s\S]*branches:\s*\n\s+- main/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /VITE_BASE_PATH: \/\$\{\{ github\.event\.repository\.name \}\}\//);
  assert.match(workflow, /VITE_SUPABASE_URL: \$\{\{ vars\.VITE_SUPABASE_URL \|\| secrets\.VITE_SUPABASE_URL \}\}/);
  assert.match(workflow, /VITE_SUPABASE_ANON_KEY: \$\{\{ secrets\.VITE_SUPABASE_ANON_KEY \|\| vars\.VITE_SUPABASE_ANON_KEY \}\}/);
  assert.doesNotMatch(workflow, /SERVICE_ROLE|service_role/i);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("publishing docs explain Supabase setup, demo fallback, and deployment configuration", async () => {
  const readme = await readFile(new URL("./README.md", import.meta.url), "utf8");
  assert.match(readme, /demo entries do not sync/i);
  assert.match(readme, /service-role key must never/i);
  assert.match(readme, /Google/i);
  assert.match(readme, /repository secret/i);
  assert.match(readme, /migration/i);
  assert.match(readme, /GitHub Pages/i);
  assert.match(readme, /Pages → Build and deployment → Source → GitHub Actions/);
});
