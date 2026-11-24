export const panelCss = `
.sd-root { box-sizing: border-box; height: 100%; display: flex; flex-direction: column; gap: 8px; padding: 8px; overflow: hidden; font-size: 12px; }
.sd-head { flex: none; }
.sd-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.sd-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.sd-detail > .sd-rowline { flex: none; }
.sd-empty { padding: 12px 8px; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-list { display: flex; flex-direction: column; }
.sd-item { display: block; }
.sd-rowline { display: flex; align-items: center; gap: 3px; }
.sd-open { flex: none; }
.sd-row { all: unset; display: flex; align-items: center; flex-wrap: nowrap; gap: 4px; box-sizing: border-box; flex: 1 1 auto; min-width: 0; min-height: 22px; padding: 2px 6px; border-radius: 4px; cursor: pointer; overflow: hidden; }
.sd-row:hover:not(:disabled) { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-row:focus-visible { outline: 1px solid var(--v2-blue-600, #3b82f6); outline-offset: -1px; }
.sd-row:disabled { cursor: default; }
.sd-deep { border-left: 1px solid var(--v2-border-border-base, rgba(127,127,127,.25)); }
.sd-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--v2-text-text-faint, rgba(127,127,127,.7)); }
.sd-dot-running { background: var(--v2-blue-600, #3b82f6); animation: sd-pulse 1.6s ease-in-out infinite; }
@keyframes sd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .sd-dot-running { animation: none; } }
.sd-dot-succeeded { background: var(--v2-green-600, #30a46c); }
.sd-dot-failed { background: var(--v2-red-600, #e5484d); }
.sd-dot-interrupted { background: var(--v2-orange-600, #f76b15); }
.sd-agent { flex: none; max-width: 14%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; border-radius: 3px; background: var(--v2-background-bg-muted, rgba(127,127,127,.12)); }
.sd-title { display: block; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-meta { display: flex; align-items: baseline; gap: 3px; flex: none; margin-left: auto; white-space: nowrap; }
/* Same line box height in every cell; the smaller token text is nudged down onto the numbers' baseline. */
.sd-meta > * { line-height: 1.4; }
.sd-num { flex: none; line-height: 1.4; font-variant-numeric: tabular-nums; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-time { min-width: 22px; text-align: right; }
.sd-tok { flex: none; display: inline-flex; align-items: baseline; gap: 2px; font-size: 10px; line-height: 1.4; transform: translateY(1px); font-variant-numeric: tabular-nums; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); white-space: nowrap; }
.sd-tok-icon { flex: none; display: inline-flex; align-items: center; line-height: 1; }
.sd-tok-text { flex: none; }
.sd-tabs { flex: none; display: flex; gap: 2px; border-bottom: 1px solid var(--v2-border-border-base, rgba(127,127,127,.25)); }
.sd-tab { all: unset; box-sizing: border-box; padding: 3px 8px; border-radius: 4px 4px 0 0; cursor: pointer; font-size: 11px; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-tab:hover { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-tab-active { color: var(--v2-text-text-base, inherit); background: var(--v2-background-bg-muted, rgba(127,127,127,.12)); }
.sd-tab:focus-visible { outline: 1px solid var(--v2-blue-600, #3b82f6); outline-offset: -1px; }
.sd-out { flex: 1 1 auto; min-height: 0; overflow: auto; box-sizing: border-box; margin: 0; padding: 6px 8px; border-radius: 4px; background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); font-size: 11px; }
.sd-out:focus-visible { outline: 1px solid var(--v2-blue-600, #3b82f6); outline-offset: -1px; }
.sd-out-state { color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-group { all: unset; display: flex; align-items: center; gap: 4px; box-sizing: border-box; width: 100%; padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 11px; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-group:hover { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-group:focus-visible { outline: 1px solid var(--v2-blue-600, #3b82f6); outline-offset: -1px; }
.sd-caret { flex: none; width: 8px; }
.sd-more { all: unset; padding: 4px 6px; border-radius: 4px; cursor: pointer; color: var(--v2-blue-600, #3b82f6); }
.sd-more:hover { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-more:focus-visible { outline: 1px solid var(--v2-blue-600, #3b82f6); outline-offset: -1px; }
.sd-footer { flex: none; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; padding: 6px 2px 0; border-top: 1px solid var(--v2-border-border-base, rgba(127,127,127,.25)); color: var(--v2-text-text-muted, rgba(127,127,127,.9)); font-size: 10px; }
.sd-footer-sep { flex: none; }
.sd-muted { opacity: .55; }
.sd-pending { font-style: italic; opacity: .8; }
.sd-reason { display: flex; flex-direction: column; margin: 0 6px 4px 0; padding: 4px 6px; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); font-size: 11px; line-height: 1.45; }
.sd-reason-block > summary { display: flex; align-items: baseline; gap: 4px; padding: 2px 0; list-style: none; cursor: pointer; line-height: 1.45; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-reason-block > summary::-webkit-details-marker { display: none; }
.sd-reason-block > summary::before { content: "▸"; flex: none; width: 8px; }
.sd-reason-block[open] > summary::before { content: "▾"; }
.sd-reason-block > summary > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-reason-block + .sd-reason-block { margin-top: 4px; }
/* Caret 8px + gap 4px = 12px: the body's 11px margin plus its 1px border lands its text on the same line. */
.sd-reason-text { margin-left: 11px; margin-top: 4px; margin-bottom: 4px; padding-left: 0; border-left: 1px solid var(--v2-border-border-base, rgba(127,127,127,.25)); line-height: 1.45; max-height: 240px; overflow: auto; white-space: pre-wrap; }
`
