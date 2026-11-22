# Subagents for OpenCode Desktop

A side-panel plugin for OpenCode Desktop 2 that shows the subagents of the current session as
a tree: which ones are running, what they are doing, and what they have cost so far.

Each row carries a status dot, the agent name, the session title, tokens (input + output), cost
and elapsed time. Click a row to open that subagent's session in a new tab. A `⚡ N` badge in the
bottom bar of the window appears while subagents run.

Russian version: [README.ru.md](README.ru.md).

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

**Staying open.** Open the panel once - from the `+` menu, the palette, `/agents` or the badge -
and it stays pinned: every session you switch to gets it back. Closing the panel's tab unpins it.
Desktop keeps panel tabs per session, so the plugin reopens its own panel on a switch; after a
Desktop restart the panel also opens by itself if it was open when you quit.

**Tree.** Rows are grouped by `parentID` and indented by depth, so children stay under their
parent. When a row at the deepest level (3) has children of its own, they collapse into a
non-clickable `…` marker line.

**Order.** Within one level, running rows come first, the rest follow by creation time, newest
on top. Children always sit directly under their parent, so the tree reads top to bottom.
A subagent that is known from the session's `background` list but is not in the session store
yet is listed first as running, in italics, until it is synced.

**Row.** Status dot, agent, title, tokens (input + output), cost, time. The title is cut to one
line; hover shows it in full. Statuses and dot colors:

| Status | Dot | Meaning |
| --- | --- | --- |
| Running | blue | Still working, wait for it |
| Succeeded | green | Finished normally |
| Failed | red | Finished with an error |
| Interrupted | orange | Stopped before finishing |
| Idle | grey | Known, not started or not running |

**Empty usage.** A still-running subagent with no usage events yet shows `—` for tokens and
cost instead of zeros. Amounts format as `812`, `12.3k`, `1.2M`; cost below one cent shows
`<$0.01`.

**Time.** For a running row, time since the run started (`time.busy`) up to now, refreshed
once a second. For a finished row, the run duration, `idle - busy`. If either timestamp is
missing, `—`.

**Click.** A row opens that subagent's session in a new tab. The `▸` twisty at the left of a row
expands its output instead, while the row itself still opens the chat. Rows of sessions that no
longer exist (`missing`, for example after a deletion) are dimmed, disabled and have no twisty.

**Inline output.** `▸` replaces the list with that subagent's last output: its row stays pinned at
the top and the output fills the rest of the panel with its own scroll. The filter, the finished
group and `+N more` are hidden while it is open; the footer stays. `▾` brings the list back where
you left it, with the same focus and scroll position. Only one output is open at a time, and
switching sessions closes it.

The output is the last text the subagent's assistant wrote, rendered as markdown by Desktop:
headings, lists, tables, code with highlighting and a copy button, links. Reasoning and tool
calls are not shown. It is fetched the first time you expand the row: `Loading output…` until it
arrives, `No output yet` when the subagent has not answered.

**Filter.** **Only active** hides finished subagents and the finished group.

**Finished group.** Finished subagents sit under a `N finished` header that collapses on click.
It starts expanded when there are at most 5 of them, collapsed above that.

**Long lists.** At most 200 rows render at once; a `+N more` button shows the rest.

**States.** `No subagents yet` while the session has none, `Loading…` while the first sync
runs, `No active subagents` when the filter leaves nothing, and a toast when the sync fails.

**Footer.** `N agents · X tokens · $Y` for every subagent of the session, including those
hidden by the filter, the finished group or the row limit.

**Badge.** While at least one subagent of the current session runs, `⚡ N` sits in the bottom
bar of the window. Clicking it opens the panel.

**Notifications.** When a subagent finishes while no window of the app has focus, a system
notification appears: failed runs as errors, the rest as normal completions. Clicking it opens
that subagent's session. Notifications follow OpenCode's own settings (Settings > Notifications:
Agent and Errors, plus their sounds) and arrive at most once per completion.

**Data.** Everything comes from the Desktop session store and its events; the plugin reads
nothing else. Switching to a session loads its children once, then status, tokens and timers
update as events arrive. Panel state (filter, expanded groups, the open output) resets when you
switch sessions.

## Limits and notes

- Only subagents of the current session are listed; other tabs' sessions are not.
- Tree depth is capped at 3; deeper subagents show as `…`.
- At most 200 rows render before `+N more`.
- The output is only the last assistant text: reasoning, tool calls and earlier turns are left
  out. It is loaded on the first expansion of a row, and one output is open at a time.
- A `missing` row has no twisty, so its output cannot be opened.
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
| `src/gui.tsx` | GUI entry: panel, pinning, `+` menu item, `/agents` command, bottom-bar slot, styles |
| `src/gui/dashboard.tsx` | the panel: rows, inline output, filter, finished group, row limit, footer |
| `src/gui/badge.tsx` | `⚡ N` badge and completion notifications |
| `src/gui/model.ts` | pure model: tree, ordering, background merge, last assistant text, formatters |
| `src/gui/definition.ts` | plugin definition with the en/ru dictionaries |
| `src/gui/i18n.ts` | English and Russian copy |

Expanding an output syncs that session's messages (`message.sync`), so a session that is also open
in a chat tab may re-read its message window.

## Releases

Bump `version` in `package.json`, add a `CHANGELOG.md` entry, tag `vX.Y.Z` and push the tag.

## License

MIT - see [LICENSE](LICENSE).
