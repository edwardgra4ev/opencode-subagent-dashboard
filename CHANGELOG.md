# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions use
[SemVer](https://semver.org/).

## [0.2.2] - 2026-11-24

### Added

- The command that opens the panel (**Open subagents** in the palette, `/agents`) has a default
  keybind, `mod+alt+a`, and lives in Settings > Shortcuts under `navigation`. Rebind it there; the
  panel's `+` menu item shows the current shortcut. The command only opens and shows the panel - it
  does not toggle or close it: a tab that is in the strip but hidden comes back, one already on
  screen stays as it is.

## [0.2.1] - 2026-11-24

### Fixed

- Token counts that round up to 1000 read `1k` instead of a bare `1000` next to it; only
  non-integer usage values reach this case.
- Per-session panel state (filter, finished group, expansion, open detail, scroll), kept forever for
  sessions whose panel was never closed, is now bounded: the 100 most recently used sessions are
  kept, and the least recently used one is dropped beyond that.

### Internal

- The panel's view code is split into modules (`row`, `output`, `bits`, `css`, `panel-state`) with
  no change in look or interaction; shared markup (reasoning blocks, token chips) is rendered by
  one component each.
- Unit tests for the model, the formatters and the panel-state cache: `npm test` (`vitest`), 59
  cases in 2 files.
- CI and the release workflow run `npm test`, and both fail if the tracked `dist/gui-experimental.cjs`
  differs from a fresh build.

## [0.2.0] - 2026-11-23

### Added

- Inline reasoning preview under a running subagent's row: the last five reasoning blocks, oldest
  first, each collapsed to a `▸` line with a one-line preview that expands in place and scrolls
  inside a 240px-tall body. Only running rows show it; it disappears when the subagent finishes.
- `Reasoning` tab in the detail, between **Input** and **Output**: every reasoning block of the
  subagent as the same collapsible blocks, loading older history like the Input tab, with
  `Loading reasoning…`, `No reasoning recorded` and an inline error retried by clicking the tab.
- `←`/`→` cycle the three tabs and `Home`/`End` jump to Input and Output; the detail's tab strip
  and scrolling area take keyboard focus and show a focus ring.

## [0.1.1] - 2026-11-22

### Fixed

- The side panel no longer asks for a width of its own, so selecting its tab leaves the sidebar at the
  shared width like the other tabs; a width an earlier version saved for the panel no longer applies.

## [0.1.0] - 2026-11-22

### Added

- Side panel listing the subagents of the current session as a tree by `parentID`, indented by
  depth. Rows at the deepest level (3) with children of their own collapse into a
  non-clickable `…` marker.
- Ordering: children directly under their parent, running rows first on each level, the rest by
  creation time, newest on top. Subagents known only from the session's `background` list are
  listed first as running, in italics, until synced.
- Per-row view: status dot, agent, one-line title, and on the right the token buckets
  `↑ input`, `↓ output`, `R cache read`, `W cache write`, their total, cost and time. A running
  subagent with no usage yet shows one `—` instead of zeros; a running dot pulses, and the
  animation is off under `prefers-reduced-motion: reduce`.
- Running rows count up from `time.busy`, finished rows show `idle - busy`.
- Click a row to open its detail in the panel; a second click returns to the list with its
  scroll position and the row focus restored.
- Detail replacing the list: the agent's row pinned at the top, two tabs, **Input** (the first
  user message) and **Output** (the last assistant text), markdown rendering, the output
  scrolling inside the remaining height, tabs switched by mouse or `←`/`→` and `Home`/`End`,
  one detail open at a time, lazy loading with `Loading output…`, `No output yet` and
  `No prompt recorded` states, and the Input tab retrying its history load on click.
- Chat button at the right edge of each row, tooltip `Open chat`, opening that subagent's
  session in a new tab. Rows of deleted sessions are dimmed and disabled.
- `Only active` filter and a collapsible finished group, expanded by default when no more than
  5 subagents are finished.
- Row limit of 200 rendered rows with a `+N more` button.
- Footer summary `N agents · ↑ input · ↓ output · R cache read · W cache write · total T ·
  $cost` across every subagent of the session, regardless of the filter, the finished group or
  the row limit.
- Running count in the panel's tab title (`Subagents · N`) while the current session has running
  subagents.
- System notification when a subagent finishes while no window has focus, failed runs flagged as
  errors, at most one per completion, following the user's OpenCode notification settings.
- The panel stays open across session switches once you open it (menu, palette, `/agents`) and
  reopens itself after a Desktop restart if it was open on exit; closing its tab unpins it.
- Per-session panel state: the filter, the finished group, `+N more`, the open detail and the
  list's scroll position survive leaving the tab and switching sessions; closing the panel's tab
  drops the state of that session.
- Empty, loading and sync-error states.
- English and Russian copy; styles use the app's `--v2-*` CSS variables, so light, dark and
  custom themes are inherited.
- CI workflow on push to `main` and on pull requests: `npm ci`, typecheck, build, and a check
  that the committed `dist` matches the build.
- Release workflow on `v*` tags: the tag must match `version` in `package.json`; it builds a zip
  of `src`, `dist`, the docs and the build configs and attaches it to the GitHub Release.

### Notes

- Requires OpenCode Desktop 2.3.x; the GUI plugin API is experimental and may change.
- Lists the subagents of the current session only, not of every open tab.
- The Output tab shows only the last assistant text; reasoning, tool calls and earlier turns are
  left out.
