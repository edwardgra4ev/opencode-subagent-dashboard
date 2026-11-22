import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { createKeyed, createVisitState, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { buildTree, formatCost, formatElapsed, formatTokens, mergeBackground, type Row } from "./model.js"
import type { definition } from "./definition.js"

/** Rows rendered before the list asks whether to show the rest. */
const ROW_LIMIT = 200
/** Finished groups up to this size start expanded. */
const FINISHED_AUTO_LIMIT = 5

function message(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error && "message" in error) return String(error.message)
  return String(error)
}

function rowTime(row: Row, now: number): string {
  if (row.endedAt !== undefined && row.busyAt !== undefined) return formatElapsed(row.endedAt - row.busyAt)
  if (row.status === "running" && row.busyAt !== undefined) return formatElapsed(now - row.busyAt)
  return "—"
}

export function DashboardView(props: { session: MountedSession }) {
  const ctx = usePlugin<typeof definition>()
  const [loading, setLoading] = createSignal(true)
  const [now, setNow] = createSignal(Date.now())
  const [activeOnly, setActiveOnly] = createVisitState(false)
  const [expanded, setExpanded] = createVisitState(false)
  const [finishedOpen, setFinishedOpen] = createSignal<boolean | undefined>(undefined)

  createKeyed(
    () => props.session,
    (session) => {
      setLoading(true)
      void session.server.data.session
        .sync(session.id, { children: true })
        .catch((error: unknown) =>
          ctx.toast.show({ variant: "error", title: ctx.t("state.error", { message: message(error) }) }),
        )
        .finally(() => setLoading(false))
    },
  )

  const rows = createMemo(() => {
    const session = props.session
    const data = session.server.data.session
    const deps = {
      status: (id: string) => data.status(id),
      missing: (id: string) => data.missing(id),
    }
    return mergeBackground(buildTree(data.list(), session.id, deps), session.background)
  })

  const anyRunning = createMemo(() => rows().some((row) => row.status === "running"))

  // Tick only while something runs. Reads `anyRunning()`, never `now()`, so the effect does not restart every second.
  createEffect(() => {
    if (!anyRunning()) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  const footer = createMemo(() => {
    let tokens = 0
    let cost = 0
    for (const row of rows()) {
      tokens += row.tokens.input + row.tokens.output
      cost += row.cost
    }
    return { count: rows().length, tokens: formatTokens(tokens), cost: formatCost(cost) }
  })

  const active = createMemo(() => rows().filter((row) => row.status === "running"))
  const finished = createMemo(() => rows().filter((row) => row.status !== "running"))
  const finishedExpanded = () => finishedOpen() ?? finished().length <= FINISHED_AUTO_LIMIT

  const visible = createMemo(() => {
    const running = active()
    return activeOnly() || !finishedExpanded() ? running : [...running, ...finished()]
  })

  const shown = createMemo(() => {
    const all = visible()
    return expanded() || all.length <= ROW_LIMIT ? all : all.slice(0, ROW_LIMIT)
  })
  const more = createMemo(() => visible().length - shown().length)
  const activeShown = createMemo(() => shown().filter((row) => row.status === "running"))
  const finishedShown = createMemo(() => shown().filter((row) => row.status !== "running"))
  // While truncated before the finished group, its header waits for "+N more".
  const finishedGroup = () => !activeOnly() && finished().length > 0 && (more() === 0 || expanded())

  const rowView = (row: Row) => (
    <button
      type="button"
      class="sd-row"
      classList={{ "sd-muted": row.missing, "sd-pending": row.pending, "sd-deep": row.depth > 0 }}
      style={{ "padding-left": `${8 + row.depth * 14}px` }}
      disabled={row.missing}
      onClick={() => ctx.tabs.open({ server: props.session.server.id, id: row.id }, { focus: true })}
    >
      <span class={`sd-dot sd-dot-${row.status}`} title={ctx.t(`status.${row.status}`)} />
      <span class="sd-agent">{row.agent ?? "—"}</span>
      <span class="sd-title" title={row.title}>
        {row.title}
      </span>
      <span class="sd-num">{formatTokens(row.tokens.input + row.tokens.output)}</span>
      <span class="sd-num">{formatCost(row.cost)}</span>
      <span class="sd-num sd-time">{rowTime(row, now())}</span>
    </button>
  )

  return (
    <div class="sd-root">
      <Show when={rows().length > 0}>
        <div class="sd-head">
          <ctx.ui.Switch label={ctx.t("filter.active")} checked={activeOnly()} onChange={setActiveOnly} />
        </div>
      </Show>
      <div class="sd-scroll">
        <Show
          when={rows().length > 0}
          fallback={<div class="sd-empty">{ctx.t(loading() ? "state.loading" : "state.empty")}</div>}
        >
          <Show when={!activeOnly() || active().length > 0} fallback={<div class="sd-empty">{ctx.t("filter.empty")}</div>}>
            <div class="sd-list">
              <For each={activeShown()}>{(row) => rowView(row)}</For>
              <Show when={finishedGroup()}>
                <button
                  type="button"
                  class="sd-group"
                  aria-expanded={finishedExpanded()}
                  onClick={() => setFinishedOpen(!finishedExpanded())}
                >
                  <span class="sd-caret">{finishedExpanded() ? "▾" : "▸"}</span>
                  {ctx.t("group.finished", { count: finished().length })}
                </button>
              </Show>
              <Show when={finishedExpanded()}>
                <For each={finishedShown()}>{(row) => rowView(row)}</For>
              </Show>
              <Show when={more() > 0}>
                <button type="button" class="sd-more" onClick={() => setExpanded(true)}>
                  {ctx.t("state.more", { count: more() })}
                </button>
              </Show>
            </div>
          </Show>
        </Show>
      </div>
      <Show when={rows().length > 0}>
        <div class="sd-footer">{ctx.t("footer.summary", footer())}</div>
      </Show>
    </div>
  )
}

export const panelCss = `
.sd-root { box-sizing: border-box; height: 100%; display: flex; flex-direction: column; gap: 8px; padding: 8px; overflow: hidden; font-size: 12px; }
.sd-head { flex: none; }
.sd-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.sd-empty { padding: 12px 8px; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-list { display: flex; flex-direction: column; }
.sd-row { all: unset; display: flex; align-items: center; gap: 6px; box-sizing: border-box; width: 100%; min-height: 22px; padding: 2px 6px; border-radius: 4px; cursor: pointer; }
.sd-row:hover:not(:disabled) { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-row:focus-visible { outline: 1px solid var(--v2-blue, #3b82f6); outline-offset: -1px; }
.sd-row:disabled { cursor: default; }
.sd-deep { border-left: 1px solid var(--v2-border-border-base, rgba(127,127,127,.25)); }
.sd-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--v2-text-text-faint, rgba(127,127,127,.7)); }
.sd-dot-running { background: var(--v2-blue, #3b82f6); }
.sd-dot-succeeded { background: var(--v2-green, #30a46c); }
.sd-dot-failed { background: var(--v2-red, #e5484d); }
.sd-dot-interrupted { background: var(--v2-orange, #f76b15); }
.sd-agent { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; border-radius: 3px; background: var(--v2-background-bg-muted, rgba(127,127,127,.12)); }
.sd-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-num { flex: none; font-variant-numeric: tabular-nums; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-time { min-width: 34px; text-align: right; }
.sd-group { all: unset; display: flex; align-items: center; gap: 4px; box-sizing: border-box; width: 100%; padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 11px; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-group:hover { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-group:focus-visible { outline: 1px solid var(--v2-blue, #3b82f6); outline-offset: -1px; }
.sd-caret { flex: none; width: 8px; }
.sd-more { all: unset; padding: 4px 6px; border-radius: 4px; cursor: pointer; color: var(--v2-blue, #3b82f6); }
.sd-more:hover { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-more:focus-visible { outline: 1px solid var(--v2-blue, #3b82f6); outline-offset: -1px; }
.sd-footer { flex: none; padding: 6px 2px 0; border-top: 1px solid var(--v2-border-border-base, rgba(127,127,127,.25)); color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-muted { opacity: .55; }
.sd-pending { font-style: italic; opacity: .8; }
`
