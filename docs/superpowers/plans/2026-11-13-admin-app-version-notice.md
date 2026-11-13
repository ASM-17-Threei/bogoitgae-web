# Admin Web — App Version & Notice Tabs Implementation Plan

**Goal:** Let an admin manage the per-OS app version policy, see the user version distribution, manage startup notices, and see each user's app version — all in the existing admin page.

**Architecture:** Plain static page, no build step. Two new tabs are registered in the existing `TABS` registry in `js/admin.js` and two nav buttons are added in `admin/index.html`. All server calls go through the existing `api()` helper. No new files, no new dependencies.

**Tech Stack:** Vanilla JS (`js/admin.js`), static HTML (`admin/index.html`), `css/admin.css`.

Spec: backend repo `docs/superpowers/specs/2026-11-12-app-version-notice-design.md` (section "관리자 웹 설계"). This is plan 2 of 3 (1 = backend, done; 3 = Flutter app).

## Global Constraints

- Branch `feat/admin-app-version` (base `origin/main`) in `/Users/User/Desktop/swMaestro/bogo-dog/bogoitgae-web`.
- Only `js/admin.js`, `admin/index.html`, and (only if an existing class cannot express the layout) `css/admin.css` change.
- Reuse the existing helpers — `api`, `el`, `selectOption`, `fmtDate`, `fmtPlatform`, `buildTable`/`renderTable`, `renderPager`, `renderFilters`, `openDialog`, `closeDetail`, `toast`, `dl`, `localInputValue`, `safeHttpUrl` — and the existing CSS classes (`detail-section`, `summary-cards`, `summary-card`, `grant-form`, `btn btn-sm`, `btn-primary`, `muted`, `badge-error` …). Do not write new generic helpers when one exists.
- Build DOM with `el()` / `textContent` only. Never assign server strings to `innerHTML` (notice title/body/link and policy message are admin-typed free text).
- Every write asks `confirm(...)` first and includes `[${environment}]` in the message, as the existing write actions do.
- UI text is Korean, in the tone of the existing tabs. Code comments are Korean, "why" only, same density as the surrounding code.
- A stale async response must not paint over a newer tab: keep the existing guard pattern (`if (S.tab !== '<name>' …) return;` after each `await`).
- Do not commit.

## Server contract (already implemented; paths are relative to the `api()` base)

`api()` returns the `data` field of the envelope and throws on error (existing behavior — follow how other tabs handle failures).

**`GET /admin/app-versions`** →
```json
{
  "policies": [
    {"platform": "ANDROID", "minVersion": "0.0.0", "latestVersion": "0.0.0", "storeUrl": "", "message": null, "updatedAt": "2026-11-12T00:00:00Z"},
    {"platform": "IOS", "minVersion": "0.0.0", "latestVersion": "0.0.0", "storeUrl": "", "message": null, "updatedAt": "2026-11-12T00:00:00Z"}
  ],
  "distribution": [
    {"platform": "ANDROID", "appVersion": "1.6.0", "users": 12},
    {"platform": null, "appVersion": null, "users": 5}
  ]
}
```
`distribution` is sorted by `users` descending. `platform` / `appVersion` are `null` for users who never reported one.

**`PUT /admin/app-versions/{platform}`** body `{"minVersion","latestVersion","storeUrl","message"}` → the updated policy object. 400 when: a version is not `digits.digits.digits`; `minVersion > latestVersion`; `storeUrl` is neither empty nor `https://…`. `message` may be `null`/empty (the app then shows its default text). An empty `storeUrl` turns the update prompt off for that OS.

Meaning: app version `< minVersion` → forced update (the app is blocked); `< latestVersion` → recommended update.

**`GET /admin/notices?page=&size=`** → page object `{items, page, size, totalElements, totalPages}`; item:
```json
{"id": 7, "title": "점검 안내", "body": "…", "linkUrl": null, "platform": null,
 "startsAt": "2026-11-01T00:00:00Z", "endsAt": null, "createdAt": "2026-10-31T00:00:00Z", "active": true}
```
`platform: null` = all OSes. `endsAt: null` = no end. `active` = shown in the app right now. The app shows only one notice: among active ones, the one with the latest `startsAt`.

**`POST /admin/notices`**, **`PUT /admin/notices/{id}`** body `{"title","body","linkUrl","platform","startsAt","endsAt"}` → the notice. 400 when: `title`/`body` blank; `title` > 100 chars; `body` > 2000 chars; `endsAt` not after `startsAt`; `linkUrl` neither empty nor `https://…`.

**`DELETE /admin/notices/{id}`** → 204.

**Existing `GET /admin/users` items and `GET /admin/users/{id}`** now also carry `appVersion` (string or `null`).

---

### Task 1: "앱 버전" tab

**Files:** Modify `admin/index.html` (nav), `js/admin.js`.

- [ ] **Step 1:** In `admin/index.html`, add two nav buttons after the `stats` button, in this order: `<button data-tab="appVersions" class="tab">📱 앱 버전</button>` and `<button data-tab="notices" class="tab">📢 공지</button>`.
- [ ] **Step 2:** Register `TABS.appVersions = { async load() { … } }` next to `TABS.stats`. It clears `#filters` and `#pager`, calls `GET /admin/app-versions`, and renders into `#table-wrap`:
  1. One section per policy (`ANDROID` first, then `IOS`; label with `fmtPlatform`), each a form with four inputs — 최소 버전 (강제), 최신 버전 (권장), 스토어 주소, 안내 문구 — pre-filled from the policy, a `저장` submit button, and a muted line showing `fmtDate(updatedAt)`. Version inputs: `required`, `pattern="\d{1,5}\.\d{1,5}\.\d{1,5}"`, placeholder `1.6.0`. Store URL input: `type="url"`, not required, placeholder showing an `https://` store link. Message: max length 500, optional, placeholder explaining that empty = app default text.
  2. Under each form, one muted hint line that states the current effect in plain Korean, computed from the form's saved values: when `storeUrl` is empty → "스토어 주소가 비어 있어 안내가 꺼져 있어요"; otherwise how many users of that OS are below `minVersion` (forced) and below `latestVersion` but not below `minVersion` (recommended), counted from `distribution`.
  3. A "버전 분포" section: a table of `distribution` with columns OS (`fmtPlatform`, `null` → `미확인`), 앱 버전 (`null` → `알 수 없음`), 사용자 수 (localized number), 비율 (share of total, one decimal, `%`). Add a muted note: versions are recorded at login/token refresh, so users on app versions older than this feature appear as `알 수 없음`.
- [ ] **Step 3:** Version comparison helper used by the hint and the confirm text: compare `major.minor.patch` numerically (not as strings — `1.10.0` > `1.9.0`); a `null`/unparseable version is never counted as "below".
- [ ] **Step 4:** Submit handler: trim values; build the body (`message` empty → `null`); count users of that OS in `distribution` whose version is below the **new** `minVersion`; then `confirm` with a message that includes `[${environment}]`, the OS, the new min/latest versions, and — this is the safety net against locking everyone out — the sentence "이 값이면 현재 {OS} 사용자 N명이 강제 업데이트 대상이에요 (앱을 쓸 수 없게 됩니다)" when N > 0. If the new `storeUrl` is empty, say instead that the prompt will be turned off. On confirm → `PUT`, toast success, reload the tab. On failure, toast the error (same way other write actions in this file do) and re-enable the button.

**Acceptance:**
- `node --check js/admin.js` passes.
- The existing `adminSelfCheck()` still passes on page load (it runs automatically; do not break it).
- With the sample response above, the page shows two policy forms and a two-row distribution table, the `null` row reading `미확인 / 알 수 없음`.
- Entering `minVersion` `1.7.0` for ANDROID with the sample distribution produces a confirm text that says 12 users will be forced.
- Comparing `1.10.0` with `1.9.0` treats `1.10.0` as newer.

### Task 2: "공지" tab

**Files:** Modify `js/admin.js`.

- [ ] **Step 1:** Register `TABS.notices = { async load() { … } }` next to `TABS.appVersions`. Filters area: a single `새 공지` button (`btn btn-sm btn-primary`). Body: paged list from `GET /admin/notices` (use the existing list-query/pager pattern of other list tabs) with columns: ID, 상태, 제목, 대상 OS (`null` → `전체`), 시작, 종료 (`null` → `계속`), 등록. 상태 is derived on the client from `active`, `startsAt`, `endsAt`: `노출 중` (active), `예약` (starts in the future), `종료` (otherwise). Because the app shows only one notice, mark the single winner — among `active` rows the one with the latest `startsAt` (ties → larger `id`) — as `노출 중 · 앱에 표시`, and add a muted note under the table explaining that only that one is shown in the app. (The winner can only be determined from the first page when it is on it; state that limitation in a code comment rather than fetching extra pages.)
- [ ] **Step 2:** Clicking a row or `새 공지` opens the existing `<dialog>` via `openDialog` with a form: 제목 (required, max 100), 본문 (`textarea`, required, max 2000), 링크 (`type="url"`, optional, https placeholder), 대상 OS (`전체` / Android / iOS), 시작 (`datetime-local`, required, defaults to now for a new notice), 종료 (`datetime-local`, optional), buttons `저장` and — for an existing notice only — `삭제`. Convert `datetime-local` values to ISO (UTC) the same way the subscription grant form does (`new Date(value).toISOString()`), and pre-fill from ISO with `localInputValue`.
- [ ] **Step 3:** Client-side checks before sending (toast and stop): end must be after start; link, when present, must start with `https://`. Then `confirm` (with `[${environment}]`, the title, and the display window) → `POST` (new) or `PUT /admin/notices/{id}` (existing) → toast, close the dialog, reload the list. `삭제` → `confirm` → `DELETE` → toast, close, reload.
- [ ] **Step 4:** Show a small live preview inside the dialog labelled "앱에서 보이는 모습" — title in bold and body with line breaks preserved (CSS `white-space: pre-wrap` via an existing class if one fits, otherwise one small rule in `css/admin.css`), plus `자세히 보기` when a link is set — updated on input. Text only, via `textContent`.

**Acceptance:**
- `node --check js/admin.js` passes; `adminSelfCheck()` still passes.
- A notice with `<b>x</b>` in its title renders the literal characters in the table, the dialog and the preview (no HTML interpretation).
- Saving with an end time equal to or before the start time is stopped on the client with a toast; saving with link `javascript:alert(1)` is stopped on the client.
- With two active rows, exactly one is marked `앱에 표시`.

### Task 3: App version in the users tab

**Files:** Modify `js/admin.js`.

- [ ] **Step 1:** In `TABS.users`' table columns, add `앱 버전` immediately after the existing OS column (`appVersion`, `null` → `—`).
- [ ] **Step 2:** In `openUserDetail`, add `['앱 버전', u.appVersion || '—']` to the definition list right after the OS entry.

**Acceptance:** `node --check js/admin.js` passes; a user with `appVersion: null` shows `—`.

---

## Verification (after all tasks)

1. `node --check js/admin.js`
2. `git diff --stat` shows only `admin/index.html`, `js/admin.js`, and at most `css/admin.css`.
3. `grep -n "innerHTML" js/admin.js` shows no new occurrence compared with `git show origin/main:js/admin.js | grep -c innerHTML`.
4. Manual/automated smoke with stubbed API responses (the backend for these endpoints is not deployed yet): both tabs render the sample payloads above, the forced-update confirm text shows the user count, and the notice dialog round-trips a create.
