# Subagents for OpenCode Desktop

A side-panel plugin for OpenCode Desktop 2 that shows the subagents of the current session as
a tree: which ones are running, what they are doing, and what they have cost so far.

Each row carries a status dot, the agent name, the session title, the four token buckets
(`↑ input`, `↓ output`, `R cache read`, `W cache write`), their total, cost and elapsed time.
Click a row to open its detail inside the panel; the button at the right edge of the row opens
that subagent's chat in a new tab. While subagents run, the panel's tab title shows how many.

Russian version: [README.ru.md](README.ru.md).

![The panel: running and finished subagents with their tokens, the finished group, and a detail with Input and Output tabs](docs/preview.gif)

## Requirements

- OpenCode Desktop 2.3.x. The GUI plugin API is experimental and may change between releases.
- Node.js 20+ only if you build the plugin yourself; the repository ships the built
  `dist/gui-experimental.cjs`.
- Built against `@opencode/plugin` 2.3.2, pinned in `package.json`.

## Install from git (recommended)

```bash
git clone https://github.com/edwardgra4ev/opencode-subagent-dashboard \
  ~/.config/opencode/plugins/subagent-dashboard
```

Add the plugin to `~/.config/opencode/opencode.json`:

```json
{
  "plugins": ["./plugins/subagent-dashboard"]
}
```

Restart OpenCode Desktop once. The panel then appears in the side region's `+` menu, in the
command palette, and on `/agents`.

`dist/gui-experimental.cjs` is committed, so a clone needs no build step. To update:

```bash
git -C ~/.config/opencode/plugins/subagent-dashboard pull
```

Then restart Desktop (or reload plugins from the app).

## Install from a release archive

Every tagged release attaches `opencode-subagent-dashboard-vX.Y.Z.zip`: `src`, the built `dist`,
the docs and the build configs (`package.json`, the lockfile, `vite.config.ts`, `tsconfig.json`).
No `node_modules` and no git history, so the archive installs without Node.js:

```bash
mkdir -p ~/.config/opencode/plugins/subagent-dashboard
unzip opencode-subagent-dashboard-v0.1.0.zip \
  -d ~/.config/opencode/plugins/subagent-dashboard
```

Then point `plugins` at `./plugins/subagent-dashboard` as in the git install and restart Desktop.

## Install elsewhere

The plugin also loads from any directory. Point `plugins` at it directly, absolute or relative
to the config directory:

```json
{
  "plugins": ["/mnt/hdd/Dev/opencode-plugins/opencode-subagent-dashboard"]
}
```

## Opening the panel

- Side region `+` menu, then **Subagents**.
- Command palette, **Open subagents**.
- `/agents` in the composer. It is disabled when no session is open.
- Shortcut: the `+` menu item shows the shortcut of the command `subagent-dashboard.open`.
  The plugin defines no default keybind; assign one to that command in Settings > Shortcuts.

## What the panel shows

The panel lists the subagents of the session in the current tab, not every session of the app.

**Staying open.** Open the panel once - from the `+` menu, the palette or `/agents` - and it
stays pinned: every session you switch to gets it back. Closing the panel's tab unpins it.
Desktop keeps panel tabs per session, so the plugin reopens its own panel on a switch; after a
Desktop restart the panel also opens by itself if it was open when you quit.

**Tree.** Rows are grouped by `parentID` and indented by depth, so children stay under their
parent. When a row at the deepest level (3) has children of its own, they collapse into a
non-clickable `…` marker line. Children only exist when a subagent has the `task` tool and
spawns agents itself: orchestrator-style agents do, `explore`, `docs` and most others never
will, so a session can well stay flat.

**Order.** Within one level, running rows come first, the rest follow by creation time, newest
on top. Children always sit directly under their parent, so the tree reads top to bottom.
A subagent that is known from the session's `background` list but is not in the session store
yet is listed first as running, in italics, until it is synced.

**Row.** Status dot, agent, title, and on the right the four token buckets - `↑` input,
`↓` output, `R` cache read, `W` cache write - then their total, the cost and the elapsed time.
The title is cut to one line; screen readers get the full title from the row's accessible name.
Statuses and dot colors:

| Status | Dot | Meaning |
| --- | --- | --- |
| Running | blue | Still working, wait for it |
| Succeeded | green | Finished normally |
| Failed | red | Finished with an error |
| Interrupted | orange | Stopped before finishing |
| Idle | grey | Known, not started or not running |

A running dot pulses; with `prefers-reduced-motion: reduce` the animation is off.

**Empty usage.** A still-running subagent with no usage events yet shows one `—` instead of the
buckets, the total, the cost and the time, rather than zeros. Amounts format as `812`, `12.3k`,
`1.2M`; a total of `input + output + read + write`; cost below one cent shows `<$0.01`.

**Time.** For a running row, time since the run started (`time.busy`) up to now, refreshed
once a second. For a finished row, the run duration, `idle - busy`. If either timestamp is
missing, `—`.

**Click a row.** A row opens that subagent's detail inside the panel; clicking it again returns
to the list (see below). The arrow button at the right edge of the row, tooltip **Open chat**,
opens that subagent's session in a new tab. Rows of sessions that no longer exist (`missing`,
for example after a deletion) are dimmed and disabled, so neither action is available.

**Detail.** The detail replaces the list: the agent's row stays pinned at the top and gets two
tabs, **Input** and **Output**. **Input** is the task the subagent was given - the first user
message with text; **Output** is the last text its assistant wrote. Both are rendered as
markdown by Desktop: headings, lists, tables, code with highlighting and a copy button, links.
Reasoning and tool calls are not shown. The output fills the remaining height of the panel and
scrolls inside it; the footer stays. Switch tabs with the mouse or with `←`/`→`; `Home` and
`End` jump to Input and Output. The detail always opens on **Output**, one detail is open at a
time, and opening another row replaces it.

The detail is fetched the first time you open it: `Loading output…` until the messages arrive.
An empty Output tab reads `No output yet`; the Input tab reads `No prompt recorded` once the
session's history is fully loaded. Older messages are loaded on the first open of the Input tab,
so it can show `Loading output…` while the prompt is still being fetched. If that load fails the
tab shows `Could not load the output: …`, and clicking **Input** again retries.

**Filter.** **Only active** hides finished subagents and the finished group. It appears once the
session has subagents.

**Finished group.** Finished subagents sit under a `N finished` header that collapses on click.
It starts expanded when there are at most 5 of them, collapsed above that.

**Long lists.** At most 200 rows render at once; a `+N more` button shows the rest.

**States.** `No subagents yet` while the session has none, `Loading…` while the first sync
runs, `No active subagents` when the filter leaves nothing, and a toast when the sync fails.

**Footer.** `3 agents · ↑ input 4.2k · ↓ output 812 · R 80k · W 11.4k · total 96.4k · $0.12`
for every subagent of the session, including those hidden by the filter, the finished group or
the row limit.

**Notifications.** When a subagent finishes while no window of the app has focus, a system
notification appears: failed runs as errors, the rest as normal completions. Clicking it opens
that subagent's session. Notifications follow OpenCode's own settings (Settings > Notifications:
Agent and Errors, plus their sounds) and arrive at most once per completion.

**Data.** Everything comes from the Desktop session store and its events; the plugin reads
nothing else. Switching to a session loads its children once, then status, tokens and timers
update as events arrive.

**Panel state.** The filter, the finished group, `+N more`, the open detail and the list's
scroll position are kept per session. Leaving the panel's tab, or switching to another session
and back, restores what you were looking at; closing the panel's tab drops that session's
state.

## Limits and notes

- Only subagents of the current session are listed; other tabs' sessions are not.
- Tree depth is capped at 3; deeper subagents show as `…`.
- At most 200 rows render before `+N more`.
- The Output tab holds only the last assistant text: reasoning, tool calls and earlier turns
  are left out. The Input tab holds only the first user message; later steering messages are
  not part of it.
- A `missing` row is dimmed and disabled, so its detail cannot be opened.
- One detail is open at a time. Each session remembers its own open detail and list position,
  but the detail always reopens on the Output tab.
- Built for OpenCode Desktop 2.3.x and the experimental GUI plugin API; a Desktop update may
  break the panel until the plugin is updated.
- A running row is always timed from `time.busy`, because a resumed session keeps an older
  `time.idle` that would freeze the timer.

## Themes

The panel styles itself with the app's `--v2-*` CSS variables only, so light and dark themes,
including custom ones, are inherited from Desktop.

## Development

```bash
npm install
npm run typecheck
npm run build     # writes dist/gui-experimental.cjs, committed
npm run watch     # rebuild on change; reloads the panel in every window
```

`dist/` is tracked so that a plain `git clone` installs without a build. Rebuild and commit
`dist/gui-experimental.cjs` together with any change under `src/`.

Structure:

| Path | Purpose |
| --- | --- |
| `src/index.ts` | server half: `Plugin.define({ id: "subagent-dashboard" })`, no handlers |
| `src/gui.tsx` | GUI entry: panel, pinning, `+` menu item, `/agents` command, running count in the tab title, completion notifications, styles |
| `src/gui/dashboard.tsx` | the panel: rows, chat button, detail with Input/Output tabs, filter, finished group, row limit, footer, per-session view state |
| `src/gui/model.ts` | pure model: tree, ordering, background merge, `lastAssistantText`, `userPromptText`, formatters |
| `src/gui/definition.ts` | plugin definition with the en/ru dictionaries |
| `src/gui/i18n.ts` | English and Russian copy |

Opening a detail syncs that session's messages (`message.sync`), so a session that is also open
in a chat tab may re-read its message window. Loading the Input tab fetches the session's older
messages the same way.

The animation at the top of this file is a mock of the panel, generated from `docs/preview.html`:
open it for a live loop, or render one moment with `?frame=1&t=8.2` and capture the 900×520
stage. Keep it in step with any change to the panel's look.

### Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests: `npm ci`,
`npm run typecheck`, `npm run build`, then fails if the built `dist/` differs from the commit
(`git diff --exit-code -- dist`). Change anything under `src/`, rebuild and commit `dist`, or CI
rejects the branch.

## Releases

Bump `version` in `package.json`, add a `CHANGELOG.md` entry, tag `vX.Y.Z` and push the tag.
`.github/workflows/release.yml` then builds the plugin, checks that the tag equals
`v<version>` from `package.json`, packs
`opencode-subagent-dashboard-vX.Y.Z.zip` (`src`, `dist`, the docs and the build configs) and
attaches it to the GitHub Release with generated notes. See [Install from a release
archive](#install-from-a-release-archive).

## License

MIT - see [LICENSE](LICENSE).
