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

## Status
Branch `feat/skeleton` ready for review/merge; not pushed, not merged. Desktop verification pending user restart.

## Decisions
- Panel id `agents`, key `${ctx.id}:agents`, region `side`, width 360, mobile order 62, icon `fork`,
  tab `closable:"compact"`, `fallback:true`.
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

## Verification log
- Step 1: `npm run typecheck` exit 0; `npm run build` exit 0.
- Steps 2–6: typecheck/build exit 0 after each commit; tester harness (outside repo) 121/121 PASS at `da39f4c`,
  32 failures on the pre-fix tree; reviewer: no BLOCK, all FIX items fixed in `4cda389` + `da39f4c`.
- Desktop load, themes, notifications, click navigation: not verified (needs app restart).
- No test runner in repo: model/UI checks live in /tmp harnesses only (open risk).
