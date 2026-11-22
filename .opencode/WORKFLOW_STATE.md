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
2. Data: `src/gui/model.ts` (buildTree/sortRows/formatters) + wired tree. Not started.
3. UI rows/badges/footer. 4. Navigation. 5. Polish/i18n. 6. Optional bottom badge/notify. 7. Docs + release.

## Decisions
- Panel id `agents`, key `${ctx.id}:agents`, region `side`, width 360, mobile order 62, icon `fork`,
  tab `closable:"compact"`, `fallback:true`.
- Command slash `agents`, MenuItem `session.panel` keybind `${ctx.id}.open`.
- No RPC, no SQLite: only reactive GUI data APIs.
- Placeholder view in stage 1: only empty state text; no data reading.

## Verification log
- Step 1: `npm run typecheck` exit 0; `npm run build` exit 0, `dist/gui-experimental.cjs` 1955 bytes (vite 7.3.8).
- Desktop load: not verified yet (requires app restart).
