# Return Scanner Pro

Mobile-first, offline-first PWA for managing parcel returns with **isolated return lists**, fast scanning, a unique scanned-code registry and local backups.

- **Version:** 1.0.0
- **Status:** production build passing, 98 automated tests passing, headless browser acceptance smoke test passing
- **Languages:** French (LTR) and Arabic (RTL)
- **Themes:** dark, light and system
- **Data:** 100% local (IndexedDB + `localStorage` for settings). No demo data, no account, no server and no cross-device sync.

---

## Table of contents

1. [Highlights](#highlights)
2. [Validation priority](#validation-priority)
3. [Pages](#pages)
4. [Data integrity rules](#data-integrity-rules)
5. [Scanning](#scanning)
6. [Import and export](#import-and-export)
7. [Sessions and reports](#sessions-and-reports)
8. [Backups](#backups)
9. [Sound and feedback](#sound-and-feedback)
10. [Getting started](#getting-started)
11. [PWA and offline behaviour](#pwa-and-offline-behaviour)
12. [Tests and acceptance results](#tests-and-acceptance-results)
13. [Project structure](#project-structure)
14. [Known limitations](#known-limitations)

---

## Highlights

- **Isolated lists.** Every list has its own parcels, scans, statistics and exports. Importing a code into one list never affects another list.
- **Three scan inputs.** Camera (ZXing), USB/Bluetooth HID scanner (keyboard emulation) and manual entry.
- **Continuous scanning.** No page reload, no blocking alerts. The active list, connection state, save state and last result stay visible.
- **Strict validation order.** Blacklist first, then active-list membership, duplicates, other lists and finally "not required".
- **Unique registry per list.** A code has one registry row per list. Repeated attempts update the attempt count and timestamps instead of creating rows.
- **Immutable event log.** Every attempt is recorded in the scan event history, separately from the registry.
- **Reports and exports.** List reports, session reports, employee statistics and XLSX/CSV/TXT exports with UTF-8 BOM.
- **Administrative corrections only.** A returned parcel can only be corrected by an administrator with the local PIN and a mandatory reason. There is no normal undo.
- **Offline PWA.** Installable, precached application shell, offline navigation and local persistence.
- **Responsive.** Designed from 320 px phones through desktop, with a desktop sidebar and mobile bottom navigation.

---

## Validation priority

The decision engine in `src/lib/scan.ts` applies this exact order:

| Priority | Condition | Result |
| --- | --- | --- |
| 1 | Code is on the blacklist | **Return prohibited** — rejected |
| 2 | Code is pending in the active list | **Accepted** — marked returned |
| 3 | Code is already returned in the active list | **Duplicate** — warning, no second return |
| 4 | Code belongs to another return list | **Other list** — rejected |
| 5 | Code is not required anywhere | **Not required** — rejected |

Every outcome above is written to the event log. Blacklist status always wins, even when the code also exists in the active list. Codes that are duplicate, unwanted, blacklisted or from another list are tracked in the registry with the appropriate status:

- `required-returned`
- `not-required`
- `return-prohibited`

---

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Dashboard: active list, progress, quick actions, backup reminder |
| `/lists` | Create, import, merge, replace, archive and export return lists |
| `/lists/:listId` | List detail: parcels, filters, status, session controls |
| `/scan` | Camera/HID/manual scanning, active list and live result panel |
| `/search` | Smart partial search across codes, list names, employees and statuses |
| `/returned` | Returned parcels and return history |
| `/remaining` | Pending parcels for the active or selected list |
| `/not-required` | Unrequested codes seen during scans |
| `/blacklist` | Manage prohibited return codes with reasons |
| `/registry` | One row per list + code with attempts, timestamps and last result |
| `/reports` | List, session and employee reports with exports |
| `/employees` | Operators/admins and per-employee activity |
| `/backups` | Full JSON backup, restore, merge/replace and storage usage |
| `/settings` | Language, theme, sounds, speech, haptics, camera, wake lock, PIN, install |
| `/audit` | Audit trail for administrative and destructive actions |
| `/more` | Mobile entry point for secondary pages |

---

## Data integrity rules

- Codes are normalised to **uppercase strings**; leading zeros are preserved.
- A full URL scanned as a code is reduced to its **final path segment**.
- Duplicate codes are prevented **within a list** (`listId + code` is unique), not globally across unrelated lists.
- One accepted scan changes a parcel from `pending` to `returned`; a second scan only increments attempts and cannot return it twice.
- Registry rows hold `attempts`, `firstScanAt`, `lastAttemptAt`, `lastResult` and optional blacklist/other-list metadata.
- Every scan creates an **event**, including rejected attempts.
- Replacing a list's contents clears that list's parcels/registry but preserves the global event log and audit history. Replacement always requires explicit confirmation.
- Statistics exclude currently blacklisted codes from "returned" totals while keeping them in the required total.
- The PIN gate is a **local operational safeguard**, not cryptographic authentication. Anyone with access to the device/browser profile and developer tools can read or modify local data.
- Backups are plain JSON and are **not encrypted**.

Storage:

- IndexedDB database: `return-scanner-pro` (version 1), stores: `lists`, `parcels`, `registry`, `events`, `blacklist`, `sessions`, `employees`, `audit`.
- Settings: `localStorage` key `returnscanner.settings`.

---

## Scanning

### Camera

- Starts only after an explicit user action.
- Uses `@zxing/browser` with rear-camera preference and continuous decode.
- Permission failure, missing camera or insecure context degrades to a clear manual-entry message instead of breaking the page.
- Camera access requires **HTTPS or localhost**.

### USB / Bluetooth HID scanner

- Keyboard-emulation input is captured globally on the scan page.
- A configurable terminator (Enter) submits the code; rapid consecutive scans do not reload the page.
- Real hardware was **not** available in this environment; the HID path was exercised with emulated key events.

### Manual entry

- Always available as a fallback and for testing.
- Focus returns to the input after each scan when auto-focus is enabled.

The scan screen shows:

- The active list at all times.
- Online/offline state.
- Saving/saved/error state.
- The last result with colour, icon and text (not colour alone).
- A running list of recent attempts.

---

## Import and export

### Import formats

- **XLSX** (`.xlsx`)
- **CSV** (`.csv`, UTF-8; common delimiters)
- **TXT** (`.txt`, one code per line)

The import wizard:

1. Parses the file locally.
2. Shows a preview and detected header.
3. Lets the user choose the code column.
4. Analyses duplicates before writing.
5. Offers **new list**, **merge** or **replace** (replace requires confirmation).
6. Reports imported, duplicate and rejected counts.

Recognised headers include `Code`, `Code-barres`, `Code colis`, `Tracking`, `Suivi`, `رقم التتبع` and similar common labels. Files without a recognised header can still be imported by selecting the correct column.

### Exports

- Lists, parcels, registry, events, blacklist and reports can be exported.
- Formats: **XLSX**, **CSV** (UTF-8 BOM for Excel) and **TXT** where relevant.
- Filenames are sanitised and timestamped.
- Exports reflect the selected/active list and current filters where applicable.

---

## Sessions and reports

- Only **one scan session can be open at a time**. Starting a session on another list closes and saves the current one.
- Closing a session stores a snapshot report: list total/returned/remaining, completion, scans, accepted, unrequested, blacklisted attempts, duplicates, other-list attempts and timestamps.
- Closing a session marks its list as completed. Lists and sessions can be reopened by an operator.
- Reports can be exported and remain available in history.
- Employee statistics use the session/event actor and remain readable even if the employee record is later deleted.

---

## Backups

- Full JSON backup includes lists, parcels, registry, events, blacklist, sessions, employees, audit and settings.
- File name: `returnscanner-backup-YYYY-MM-DD.json`.
- Import is validated and sanitised before preview: wrong app/version, malformed objects, orphan records and duplicate keys are rejected or reported.
- **Merge:** adds missing records; existing IDs win.
- **Replace:** wipes local data and restores the backup after explicit confirmation.
- Last-backup date and a configurable reminder (default 7 days) are shown on the dashboard, backups page and settings.

Back up regularly: clearing browser storage deletes all local data.

---

## Sound and feedback

Four distinct sounds:

1. **Success** — accepted return.
2. **Rejection** — blacklisted / not required.
3. **Warning** — other list or incomplete state.
4. **Duplicate** — already returned.

Each sound can be tested from Settings. Global sound enable/disable, volume slider, optional spoken feedback in French or Arabic, and optional haptics are available. Audio is unlocked on the first pointer/key interaction to satisfy browser autoplay policies. A single feedback call is made per scan to avoid duplicate playback.

---

## Getting started

### Requirements

- Node.js 22+ (Node 24.19.0 was used)
- npm 10+
- A modern Chromium-based browser is recommended
- HTTPS (or localhost) for camera access and service-worker installation

### Commands

```bash
npm install
npm run dev        # development server, http://localhost:5173
npm test           # Vitest, 8 files / 98 tests
npm run build      # TypeScript check + production build + PWA generation
npm run preview    # serve dist/, default http://localhost:4173/return-scanner-pro/
npm run icons      # regenerate PWA icons from scripts/icons.mjs
```

If port 4173 is occupied, Vite preview automatically chooses the next free port (for example `http://localhost:4174/return-scanner-pro/`). The dev server stays at the root; only production builds use the `/return-scanner-pro/` base path.

### First run

1. Open the app.
2. Create a list manually or import an XLSX/CSV/TXT file.
3. Make it active.
4. Open **Scan** and start a session.
5. Scan with the camera, an HID scanner or manual entry.
6. Close the session to generate its report.
7. Export the list and create a JSON backup.

No sample lists or demo parcels are created.

### Deploying to GitHub Pages

The repository ships with `.github/workflows/deploy.yml`, which builds the production bundle and publishes it to GitHub Pages on every push to `main` (or manually from the **Actions** tab).

One-time setup on GitHub:

1. Push this repository to a **public** GitHub repo named `return-scanner-pro`.
2. In the repo, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. If the first workflow run failed before step 2, run it again from **Actions → Deploy to GitHub Pages → Run workflow**.

The site is then available at `https://<username>.github.io/return-scanner-pro/`. Production builds set the Vite `base` to `/return-scanner-pro/`, so the router, assets, manifest and service worker all work under that subpath. GitHub Pages serves over HTTPS, so camera scanning works.

---

## PWA and offline behaviour

- `vite-plugin-pwa` generates a manifest and Workbox service worker at build time.
- Precache includes the app shell, assets and icons (19 entries in the current build).
- Client-side routes fall back to `index.html`, so `/scan`, `/lists`, etc. work offline after the first load.
- Installable manifest: standalone display, portrait orientation, 192/512/maskable icons and SVG icon.
- Service worker is disabled in dev mode and enabled in production builds.
- Offline is verified in headless Chrome: after precache, navigating to `/scan` with the network disabled rendered the scan UI in ~286 ms.

The app never claims online sync. The connection indicator only reports browser connectivity; all writes are local.

---

## Tests and acceptance results

### Automated

```text
npm test
Test Files  8 passed (8)
Tests       98 passed (98)
```

Covered areas:

- Code normalisation, leading zeros, URL extraction and header recognition.
- Validation priority and every scan outcome.
- Statistics, list metrics, session reports and employee fallbacks.
- Partial search, filters, isolation and query clearing.
- XLSX/CSV/TXT parsing, column detection and duplicate analysis.
- Backup validation, sanitisation and restore rules.
- IndexedDB persistence, replacement and registry uniqueness.
- Store integration: accepted scans, duplicates, idempotent scan IDs, blacklist priority, other-list rejection, attempts without extra rows, replace, PIN-protected correction, session reports and restart persistence.

```text
npm run build
tsc --noEmit  ✅
vite build    ✅
PWA generate  ✅  19 precache entries
```

### Headless acceptance smoke test

The production build was served locally and exercised in headless Chrome at 390 px, 320 px and 1440 px, in French/dark and Arabic/light.

| # | Acceptance test | Result | Evidence |
| --- | --- | --- | --- |
| 1 | A pending code is accepted exactly once | **Pass** | Store/scan tests; browser scan of `001236` showed accepted; parcel changed to returned |
| 2 | A second scan is detected as duplicate | **Pass** | Duplicate result, attempts incremented, no new parcel/registry row |
| 3 | A code not requested is rejected | **Pass** | `is-not-required` result; registry status `not-required` |
| 4 | Blacklist has top priority | **Pass** | Blacklisted code returned `is-blacklisted` even when present in the active list |
| 5 | A code from another list is rejected | **Pass** | `is-other-list`, with the owning list identified |
| 6 | Remaining count is correct | **Pass** | Stats tests: total/returned/remaining/completion; blacklist exclusion |
| 7 | Partial search finds matching codes/lists | **Pass** | Search tests for partial code, prefix, list name and no leakage across lists |
| 8 | Clearing the search restores recent records | **Pass** | Empty/whitespace query returns recent registry rows; filters still apply |
| 9 | Import detects duplicate codes | **Pass** | Import tests report duplicates before writing; merge skips existing codes |
| 10 | Data survives an application restart | **Pass** | IndexedDB tests reload and re-read data; browser persistence verified |
| 11 | Core app works offline | **Pass** | Service worker active; offline navigation to `/scan` rendered in ~286 ms |
| 12 | Session/list reports are correct | **Pass** | Stats and store tests validate counts, completion and session snapshots |
| 13 | Continuous scanning works without reload | **Pass (software path)** | Multiple UI scans and simulated HID input without reload; real hardware pending |
| 14 | Mobile layout works from 320 px | **Pass** | 16 routes at 390 px and key routes at 320 px: zero page-level horizontal overflow; bottom nav visible |

Additional smoke checks:

- French dark desktop at 1440 px: sidebar visible, bottom navigation hidden.
- Arabic/light at 320 px: `lang=ar`, `dir=rtl`, `data-theme=light`, zero overflow.
- Camera modal opens and shows graceful guidance when no camera is available.
- PWA manifest valid with 4 icons; service worker controlling the page.
- Zero uncaught exceptions and zero console errors during the smoke run.

These checks were automated/headless. They are not a substitute for testing on physical phones and real scanner hardware.

---

## Project structure

```text
return-scanner-pro/
├─ public/                  PWA icons and static assets
├─ scripts/icons.mjs        Icon generation
├─ src/
│  ├─ components/           Layout, camera, import wizard, dialogs, UI primitives
│  ├─ hooks/                Online, wake lock, install prompt, HID scanner
│  ├─ i18n/                 French/Arabic dictionary and helpers
│  ├─ lib/                  Domain logic: codes, scan, stats, search, import,
│  │                        export, feedback, IndexedDB and backups
│  ├─ pages/                All application screens
│  ├─ store/                Zustand store, persistence queue and integration tests
│  ├─ App.tsx               Routing, theme, language, loading and audio unlock
│  ├─ main.tsx              React entry point
│  ├─ styles.css            Responsive, RTL, print and reduced-motion styles
│  └─ types.ts              Shared domain types
├─ index.html
├─ vite.config.ts           Vite, Vitest and PWA configuration
└─ package.json
```

---

## Known limitations

- **No sync or multi-device sharing.** Data is local to one browser profile/device. Use backups to move data.
- **No PDF export.** Reports export to XLSX, CSV and TXT.
- **XLSX numeric cells can lose leading zeros.** If a spreadsheet stores codes as numbers, Excel itself may drop leading zeros before import. Format the column as text to preserve them.
- **Camera requires HTTPS/localhost** and a browser with camera permission support.
- **Real camera and HID hardware were not tested here.** Only permission-denied behaviour and emulated keyboard input were verified.
- **The install prompt was not exercised interactively.** The manifest and service worker were validated; the prompt depends on browser heuristics.
- **No human visual/UX review.** Layout was validated programmatically at 320/390/1440 px for overflow and visibility.
- **Speech synthesis depends on installed OS/browser voices**; availability and quality vary.
- **The admin PIN is local only**, not encryption or real access control.
- **The main JS bundle is ~1.0 MB** (276 kB gzip) and triggers Vite's 500 kB chunk warning. It is precached and works offline; route-level code splitting is a possible future optimisation.
- **Browser target:** modern evergreen browsers. The stylesheet uses `color-mix()` and CSS logical properties.
- **Service worker updates** are applied automatically (`registerType: 'auto'`): the new version activates in the background and is used on the next navigation, with no manual prompt.
