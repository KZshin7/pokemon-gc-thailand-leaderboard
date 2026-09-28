# Pokémon Champions Global Challenge — Thailand

A small English/Thai local-only dashboard for Thailand-region player entries. Submit a player name, rating, and optional photo evidence; the leaderboard highlights the highest rating. No account, email address, backend, or Firebase project is required.

## Run locally

```sh
npm ci
npm start
```

Open the local URL printed by Vite. Entries and optional photos are stored in this browser's `localStorage`; the language preference is stored there too. Clearing browser storage removes the entries. Data is not shared or synchronized between browsers or devices.

## Publish with GitHub Pages

The `Build and deploy Pages` workflow runs `npm ci`, tests, and a Vite production build for the repository subpath on pull requests and pushes to `main`. It deploys only successful pushes to `main`, using the GitHub Pages artifact and the minimum `pages: write`/`id-token: write` permissions. The Vite base path is derived from the repository name in Actions.

To publish, merge or push the site changes to `main`, then in the repository settings choose **Pages → Build and deployment → Source → GitHub Actions**. For this repository, the expected URL is <https://kzshin7.github.io/pokemon-gc-thailand-leaderboard/>; the successful deployment job/environment will report the actual URL. No credentials or cloud resources are needed.

**Publication does not make this a shared leaderboard.** Each visitor's names, ratings, and optional photo evidence remain in that visitor's browser storage, do not sync to other devices, and can be inspected or changed by that browser user. The local owner token is not secure identity and does not provide cross-user access control. Do not submit confidential information. A shared public leaderboard with secure ownership requires a server-side backend and authentication, which this static site does not include.

## Important limitations

This is a prototype, not a secure multi-user website. Browser-local edit controls are only a convenience, not an authorization boundary: a person with access to the browser profile or developer tools can inspect or change stored entries. The generated browser owner token is not a secret. Do not enter confidential information or treat ratings, names, photos, or statuses as verified. Optional evidence photos remain on this device in browser storage.

The dashboard does not collect or display email addresses and has no sign-in flow. The local prototype cannot securely identify a submitter or enforce owner-only editing across users or devices. Publishing the static page would not make its local entries shared, private, or secure.

## Tests

```sh
npm test
npm run build
```

Tests cover local entry submission/edit persistence and ownership UX, field and evidence validation, rating spotlight selection, and English/Thai translation coverage.
