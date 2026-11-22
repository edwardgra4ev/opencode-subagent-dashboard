# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions use
[SemVer](https://semver.org/).

## [0.1.0] - 2026-11-22

### Added

- Side panel listing the subagents of the current session as a tree by `parentID`, indented by
  depth. Rows at the deepest level (3) with children of their own collapse into a
  non-clickable `…` marker.
- Per-row view: status dot (running, succeeded, failed, interrupted, idle), agent, one-line
  title, tokens (input + output), cost and time. Running rows count up from `time.busy`,
  finished rows show `idle - busy`; an unfinished subagent with no usage yet shows `-` instead
  of zeros.
- Ordering: children directly under their parent, running rows first on each level, the rest by
  creation time, newest on top. Subagents known only from the session's `background` list are
  listed first as running, in italics, until synced.
- Click a row to open that subagent's session in a new tab; rows of deleted sessions are dimmed
  and disabled.
- `Only active` filter and a collapsible finished group, expanded by default when no more than
  5 subagents are finished.
- Row limit of 200 rendered rows with a `+N more` button.
- Footer summary `N agents · X tokens · $Y` across every subagent of the session, regardless of
  the filter, the finished group or the row limit.
- `⚡ N` badge in the window's bottom bar while the current session has running subagents;
  clicking it opens the panel.
- System notification when a subagent finishes while no window has focus, failed runs flagged as
  errors, at most one per completion, following the user's OpenCode notification settings.
- The panel stays open across session switches once you open it (menu, palette, `/agents` or
  badge) and reopens itself after a Desktop restart if it was open on exit; closing its tab
  unpins it.
- Expandable last output per row: a `▸` twisty, the detail replacing the list with the agent's
  row pinned at the top and the output filling the remaining height with its own scroll,
  markdown rendering, lazy loading, one output open at a time.
- The list keeps its focus and scroll position when you come back from an output.
- Empty, loading and sync-error states.
- English and Russian copy.

### Notes

- Requires OpenCode Desktop 2.3.x; the GUI plugin API is experimental and may change.
- Lists the subagents of the current session only, not of every open tab.
- Styles use the app's `--v2-*` CSS variables, so light and dark themes are inherited.
