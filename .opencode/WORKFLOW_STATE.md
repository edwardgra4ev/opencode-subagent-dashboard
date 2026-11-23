# Subagent Dashboard — workflow state

## Goal
OpenCode Desktop GUI plugin: side panel `agents` listing subagents of the current session
(tree, status, tokens, cost, time; click opens child tab). Full spec:
`/home/gra4ev/.opencode/plan/subagent-dashboard-gui-plugin.md`.

## Facts
- Project dir: `/mnt/hdd/Dev/opencode-plugins/opencode-subagent-dashboard` (started empty).
- Git: init done on `main` (initial commit), task branch `feat/skeleton`.
- API: `@opencode/plugin` pinned exactly `2.3.2` (GUI experimental). Solid JSX, Vite build to `dist/gui-experimental.cjs`.
- Reference implementation (copy structure/style, NOT code): `/mnt/hdd/Dev/opencode-plugins/token-stats-gui-plugin`
  (`package.json`, `tsconfig.json`, `vite.config.ts`, `src/gui.tsx`, `src/gui/definition.ts`, `src/gui/i18n.ts`,
  `src/gui/panel.tsx`). Same deps and build scripts.
- Data API (stage 2+, do not use yet): `session.server.data.session.list(): SessionInfo[]`,
  `.status(id): "idle"|"running"`, `.missing(id)`, `.sync(id,{children:true})`, `.family(id)`,
  `session.background[]`, `ctx.tabs.open({server,id},{focus:true})`.
- `SessionInfo`: `{id, parentID?, projectID, agent?, model?, cost, tokens{input,output,reasoning,cache{read,write}},
  outcome?:"succeeded"|"failed"|"interrupted", time{created,updated,busy?,idle?,viewed?,archived?}, title?, location}`.
- Registered plugin dir must contain built `dist/gui-experimental.cjs` and `src/index.ts`; user adds
  `/mnt/hdd/Dev/opencode-plugins/opencode-subagent-dashboard` to `plugins` in `~/.config/opencode/opencode.json`
  (edit only after user confirms; a Desktop restart is needed).

## Steps
1. [done] Skeleton: package.json/tsconfig/vite, empty panel registered (Panel + MenuItem + Command `/agents`),
   `npm i`, `npm run typecheck`, `npm run build` → `dist/gui-experimental.cjs`. Commit `f487759` on `feat/skeleton`.
   Awaiting Desktop load check by user (plugin added to `~/.config/opencode/opencode.json`, needs restart).
2. [done] Data: `src/gui/model.ts` + wiring. Commit `e260d31`.
3. [done] UI rows/badges/footer/loading. Commit `60d47b3`.
4. [done] Navigation: row click → `ctx.tabs.open`, missing rows disabled. Commit `d8bc60e`.
5. [done] Polish: timer, only-active filter, finished collapse, >200 truncation, sticky footer. Commit `c735c39`.
6. [done] Bottom-strip badge + completion notification. Commit `36fde8c`.
7. [done] Docs (README/README.ru/CHANGELOG/LICENSE, `9ee35f0`), release metadata + committed bundle (`dc1aa01`).
   Note: docs commit came before metadata commit in history; `dist/` matches current `src` (build clean).

## Current task: reasoning blocks (branch `feat/reasoning-blocks`)
User request: show the model's reasoning (thinking parts) per subagent, as an expandable list under the row,
on a separate branch so it can be reverted.

Final shape (after several user clarifications; earlier iterations removed):
- INLINE preview under RUNNING list rows: the last 5 reasoning blocks, collapsed `<details>` each
  (`▸` 8px caret + 4px gap, text at 12px, body at 12px = 11px margin + 1px border, 4px between blocks,
  body scrolls at 240px, pre-wrap). No toggle button, no per-session open state, no `+N more`, no error/toast.
  One silent `message.sync` per running row (skipped for `pending` stubs and rows whose messages are loaded).
  Panel is a sibling of `.sd-rowline` inside `.sd-item`, indented `20 + depth*14` px, no background.
- DETAIL tab: three tabs in order `Input | Reasoning | Output`; the Reasoning tab shows ALL blocks with
  history loading (one sync + up to two `loadMore(all)` loads, inline error with retry via tab click),
  `Loading reasoning…` / `No reasoning recorded`. List mounts only when history is settled so a prepend
  cannot rebind an open `<details>`. `←`/`→` wrap, `Home`/`End` = first/last; both the tabpanel and
  `.sd-reason-text` are focusable with a focus ring.
- Data: `SessionMessageAssistant.content` parts with `type: "reasoning"`; `reasoningBlocks(messages)` in
  `src/gui/model.ts` re-reads `part.text` every call (no identity cache — the store mutates in place).
- Not in scope: agent name и todos из первого вопроса (у todos нет API, только парсинг `todowrite`).
- Docs: README.md / README.ru.md / docs/preview.html / CHANGELOG `Unreleased` updated by `docs`; preview.gif
  regeneration needs a capture pass.

Uncommitted foreign change: `.github/workflows/release.yml` (must not be touched or committed by us).

## Status
0.1.0 released: `main` at `3f16b5e`, tag `v0.1.0` pushed. Active bugfix branch `fix/sidebar-width-sync`,
uncommitted; runtime behaviour after the panel-id change is not verified yet.

## Decisions
- Panel id `agents-side` (since the width fix: the host keys the stored side width and the mobile view by panel id;
  changed from `agents` to stop reading a width dragged under the old id), tab id `agents`, tab key `${ctx.id}:agents`,
  region `side`, mobile order 62, icon `fork`, tab `closable:"compact"`, `fallback:true`.
- Command slash `agents`, MenuItem `session.panel` keybind `${ctx.id}.open`.
- No RPC, no SQLite: only reactive GUI data APIs.
- Order: tree order wins over global flat sort. `buildTree` sorts siblings (running first, then
  `time.created` desc); `mergeBackground` no longer re-sorts the whole DFS list, so a child always stays under
  its parent. Documented in README.
- Depth cap 3, deeper children shown as a synthetic disabled "…" row.
- Zero tokens/cost on a running row render as "—" (usage events may not have arrived yet).
- Notify on arrival of a terminal status (succeeded/failed/interrupted), deduped per completion
  (`endedAt`/`busyAt`), never on the first snapshot or a foreign session.
- Panel state (`activeOnly`, `expanded`, `finishedOpen`) resets on session key change.

## Follow-up (after 0.1.0)
- User request 1: panel must stay open when switching session tabs. Layout tabs are stored per session in the GUI API,
  so implement pinning: remember that the user keeps the panel open, auto-open it in the newly routed session,
  unpin when the user closes the tab.
- User request 2: show the subagent's last assistant output inline in the list. Chevron expands output under the row,
  click on the row still opens the child chat; output = last assistant message text, loaded lazily via
  `data.session.message.sync(id)` + `list(id)`.
- User request 3: render that output as Markdown via `ctx.ui.Markdown` (app renderer, no custom parser).
  Final layout (approved after two clarifications): expanding replaces the list — only the agent's row (fixed at the top)
  and the output below it, which fills the remaining panel height and scrolls internally. One output at a time.

- User request 4: panel UI state (filter, finished group, expanded, open output, list scroll) must survive remounts
  (switching panel tabs) — keep it in a module-level map keyed by `session.key`.
- User request 5: per-row token breakdown on a second line: `in · out · cache` (cache = read + write, tooltip with R/W).
- User request 6: remove the `window.bottom` badge (the API gives each plugin its own footer row, so it cannot share a line
  with git-status); show the running count in the panel tab title instead. Notifications move into `setup`.

## Process rules (binding)
- `dev` → `reviewer` → commit → `tester`. No commit and no test run before reviewer `OK`; no merge/tag before tester PASS.
- No parallel writers on the same files/types. One writer at a time.

- User request 7: token breakdown on one line (no second row): compact `↑in ↓out ⇄cache` in the main row; total column drops in favour
  of the three buckets (footer keeps input+output totals).
- User request 8: the expanded output gets two tabs — Input (the task the agent was given, i.e. the user prompt) and Output
  (last assistant answer), switchable.
- User request 9: the bottom summary shows input, output and cache separately (same compact notation), plus agents count and cost.

## Release plan (user request)
- Push to https://github.com/edwardgra4ev/opencode-subagent-dashboard (origin, branch main after merge).
- CI/CD: adapt `token-stats-gui-plugin` workflows: `ci.yml` (npm ci, typecheck, build, `git diff --exit-code -- dist`)
  on push/PR; `release.yml` on `v*` tags (typecheck, build, tag == package.json version, zip src+dist+docs,
  `softprops/action-gh-release`).
- Release: bump/tag `v0.1.0`, merge `feat/skeleton` → `main`, push main + tag.

## Fix: sidebar width sync (branch `fix/sidebar-width-sync`)
- Bug: `agents` panel declared `width: 360`, so the side region took the panel's own width and resized on tab switch.
  Reported by the user with a screen recording: two sidebar tabs share a width, `agents` stretches.
- Host docs (`@opencode/plugin/dist/gui/registries.d.ts`, `Panel.width`): a number gives the panel its own side width;
  omit it to share the conversation's width like other tabs. Decision: remove the field.
- This alone did not change the runtime behaviour after a Desktop restart. Root cause found in the installed app
  (`/opt/OpenCode/resources/app.asar`, renderer `route-*.js`): the width is
  `panelWidths[`${pluginId}:${panel.id}`] ?? provider.width`, and the app persisted
  `{"panelWidths":{"subagent-dashboard:agents":635.35546875}}` in `~/.config/ai.opencode.desktop/drafts.sqlite`
  (state `opencode.global.dat / layout`). With an override present the drag handler writes that per-panel value
  instead of the shared one, and the API has no delete.
- Decision: rename `Panel.id` to `agents-side`, keeping `PanelTab.id` and the tab key `${ctx.id}:agents`, so the
  orphaned width is not read, stored tabs and pinning keep working. Trade-off: the mobile view key becomes
  `${ctx.id}:agents-side`; the host keeps the narrow-screen selection in memory per routing visit, so no stored
  selection is lost.
- Files: `src/gui.tsx`, rebuilt `dist/gui-experimental.cjs`, `CHANGELOG.md` (Unreleased / Fixed),
  `.opencode/WORKFLOW_STATE.md`.
- Stage: round 3 in progress (comment and CHANGELOG wording fixed after reviewer findings); runtime behaviour after
  the id change not yet verified — needs a Desktop restart.

## Verification log
- Step 1: `npm run typecheck` exit 0; `npm run build` exit 0.
- Steps 2–6: typecheck/build exit 0 after each commit; tester harness (outside repo) 121/121 PASS at `da39f4c`,
  32 failures on the pre-fix tree; reviewer: no BLOCK, all FIX items fixed in `4cda389` + `da39f4c`.
- Desktop load, themes, notifications, click navigation: not verified (needs app restart).
- No test runner in repo: model/UI checks live in /tmp harnesses only (open risk).

- Fix `fix/sidebar-width-sync`: `npm run build` exit 0 (twice, dist byte-identical); `npm run typecheck` exit 0;
  `grep -c "width:360" dist/gui-experimental.cjs` → 0; reviewer round 2 OK on code and dist.
- Fix `fix/sidebar-width-sync`, tester: typecheck PASS, build PASS, dist byte-identical to a fresh build, no
  `width:360` in bundle or src, no stale "own width" claims in docs. Runtime alignment of the region still unverified
  headlessly; needs a Desktop restart (the plugin loads `dist` at start).
- Fix `fix/sidebar-width-sync` after the id rename: runtime evidence from the user's machine showed the stale
  `panelWidths` entry, not the code, kept the own width; the rename is not runtime-verified yet.
- Fix `fix/sidebar-width-sync`, tester round 2: typecheck 0, build 0, fresh build byte-identical to the tree bundle
  (`cmp` 0), `agents-side` in the bundle, no `width:360` in src/bundle/docs. Runtime alignment still needs a Desktop
  restart + manual check (drag, switch tabs, sidebar must not jump).
