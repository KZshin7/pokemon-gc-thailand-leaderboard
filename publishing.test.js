import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("static page has sharing metadata and an explicit local-data warning", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /<meta name="description"/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /<link rel="icon"[^>]+href="\.\/favicon\.svg"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /data-i18n="localOnlyDescription"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:assets|app\.js|styles\.css|favicon)/);
});

test("Pages workflow tests pull requests and deploys only successful main pushes", async () => {
  const workflow = await readFile(new URL("./.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /pull_request:[\s\S]*branches:\s*\n\s+- main/);
  assert.match(workflow, /push:[\s\S]*branches:\s*\n\s+- main/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /VITE_BASE_PATH: \/\$\{\{ github\.event\.repository\.name \}\}\//);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("publishing docs retain the local-only privacy and sync limitations", async () => {
  const readme = await readFile(new URL("./README.md", import.meta.url), "utf8");
  assert.match(readme, /do not sync to other devices/i);
  assert.match(readme, /local owner token is not secure identity/i);
  assert.match(readme, /GitHub Pages/i);
  assert.match(readme, /Pages → Build and deployment → Source → GitHub Actions/);
});
