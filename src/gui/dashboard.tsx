import { For, Show, batch, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { createKeyed, createVisitState, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import {
  formatCost,
  formatElapsed,
  formatTokens,
  lastAssistantText,
  visibleRows,
  type Row,
  type SessionData,
} from "./model.js"
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
  // Running wins: a resumed session keeps a stale `time.idle`, and its elapsed time must not freeze.
  if (row.status === "running" && row.busyAt !== undefined) return formatElapsed(now - row.busyAt)
  if (row.endedAt !== undefined && row.busyAt !== undefined) return formatElapsed(row.endedAt - row.busyAt)
  return "—"
}

/** A run that has not used anything yet shows a dash instead of a zero. */
function rowTokens(row: Row): string {
  const total = row.tokens.input + row.tokens.output
  return row.status === "running" && total === 0 ? "—" : formatTokens(total)
}

function rowCost(row: Row): string {
  return row.status === "running" && row.cost === 0 ? "—" : formatCost(row.cost)
}

/** A subagent's last assistant text, loaded on first expansion. */
function OutputBlock(props: { data: SessionData; id: string; depth: number; pending: boolean }) {
  const ctx = usePlugin<typeof definition>()
  const text = createMemo(() => lastAssistantText(props.data.message.list(props.id)))
  const waiting = () => props.pending || props.data.message.loading(props.id)
  return (
    <div
      class="sd-out"
      id={`sd-out-${props.id}`}
      style={{ "padding-left": `${8 + (props.depth + 1) * 14}px` }}
    >
      <Show
        when={text()}
        fallback={<span class="sd-out-state">{ctx.t(waiting() ? "output.loading" : "output.empty")}</span>}
      >
        {(source) => <ctx.ui.Markdown text={source()} />}
      </Show>
    </div>
  )
}

export function DashboardView(props: { session: MountedSession }) {
  const ctx = usePlugin<typeof definition>()
  const [loading, setLoading] = createSignal(true)
  const [now, setNow] = createSignal(Date.now())
  const [activeOnly, setActiveOnly] = createVisitState(false)
  const [expanded, setExpanded] = createVisitState(false)
  const [finishedOpen, setFinishedOpen] = createVisitState<boolean | undefined>(undefined)
  // One output at a time: opening another row closes the previous one (accordion).
  const [openOutput, setOpenOutput] = createSignal<string | undefined>(undefined)
  const [pendingOutputs, setPendingOutputs] = createSignal<ReadonlySet<string>>(new Set<string>())
  // Sessions whose messages were already asked for; a failure drops the id so a later expansion retries.
  const outputRequests = new Set<string>()

  // The detail replaces the list, so the list's scroll and its twisties are parked here across the swap.
  let listScroll: HTMLDivElement | undefined
  let listScrollTop = 0
  let detailTwisty: HTMLButtonElement | undefined
  const listTwisties = new Map<string, HTMLButtonElement>()

  // Forget the panel's view state when the session changes, not only on a new visit after Home.
  createKeyed(
    () => props.session.key,
    () =>
      batch(() => {
        setActiveOnly(false)
        setExpanded(false)
        setFinishedOpen(undefined)
        setOpenOutput(undefined)
        setPendingOutputs(new Set<string>())
        outputRequests.clear()
        // Another session opens at the top: forget the parked offset and move the live container there too.
        // A detail open at the switch closes in the same batch, so the list is mounted again by the microtask.
        listScrollTop = 0
        queueMicrotask(() => {
          if (listScroll) listScroll.scrollTop = 0
        })
      }),
  )

  // A sync of the previous session must not clear this one's loading state or raise its toast.
  let syncSeq = 0
  createKeyed(
    () => props.session,
    (session) => {
      setLoading(true)
      const id = ++syncSeq
      void session.server.data.session
        .sync(session.id, { children: true })
        .catch((error: unknown) => {
          if (id !== syncSeq) return
          ctx.toast.show({ variant: "error", title: ctx.t("state.error", { message: message(error) }) })
        })
        .finally(() => {
          if (id === syncSeq) setLoading(false)
        })
    },
  )

  const rows = createMemo(() => visibleRows(props.session.server.data.session, props.session))
  const byId = createMemo(() => new Map(rows().map((row) => [row.id, row])))
  // Ellipsis markers are not rows the user can pick or count.
  const count = createMemo(() => rows().filter((row) => !row.ellipsis).length)

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
      if (row.ellipsis) continue
      tokens += row.tokens.input + row.tokens.output
      cost += row.cost
    }
    return { count: count(), tokens: formatTokens(tokens), cost: formatCost(cost) }
  })

  // An ellipsis marker stays right after its parent, so it joins its parent's list rather than the finished group.
  const split = createMemo(() => {
    const running: Row[] = []
    const done: Row[] = []
    let target = done
    for (const row of rows()) {
      if (!row.ellipsis) target = row.status === "running" ? running : done
      target.push(row)
    }
    return { running, done }
  })
  const active = createMemo(() => split().running)
  const finished = createMemo(() => split().done)
  const activeCount = createMemo(() => active().filter((row) => !row.ellipsis).length)
  const finishedCount = createMemo(() => finished().filter((row) => !row.ellipsis).length)
  const finishedExpanded = () => finishedOpen() ?? finishedCount() <= FINISHED_AUTO_LIMIT

  const visible = createMemo(() => {
    if (activeOnly()) return active().filter((row) => !row.ellipsis)
    return finishedExpanded() ? [...active(), ...finished()] : active()
  })

  const shown = createMemo(() => {
    const all = visible()
    return expanded() || all.length <= ROW_LIMIT ? all : all.slice(0, ROW_LIMIT)
  })
  const more = createMemo(
    () => visible().filter((row) => !row.ellipsis).length - shown().filter((row) => !row.ellipsis).length,
  )
  const shownSplit = createMemo(() => {
    const running = new Set(active().map((row) => row.id))
    return {
      active: shown().filter((row) => running.has(row.id)),
      finished: shown().filter((row) => !running.has(row.id)),
    }
  })
  // `<For>` keyed by stable ids: a usage or status update replaces Row objects but not the rendered nodes.
  const activeIds = createMemo(() => shownSplit().active.map((row) => row.id))
  const finishedIds = createMemo(() => shownSplit().finished.map((row) => row.id))
  // The header stays whenever the finished group exists, even while the list is truncated.
  const finishedGroup = () => !activeOnly() && finishedCount() > 0

  const outputOpen = (id: string) => openOutput() === id
  // The open output replaces the list; a gone row (deleted session) falls back to the list.
  const detail = createMemo(() => {
    const id = openOutput()
    return id === undefined ? undefined : byId().get(id)
  })

  createEffect(() => {
    const id = openOutput()
    if (id !== undefined && !byId().has(id)) setOpenOutput(undefined)
  })

  const requestOutput = (id: string) => {
    const messages = props.session.server.data.session.message
    if (messages.list(id).length > 0 || messages.loading(id) || outputRequests.has(id)) return
    outputRequests.add(id)
    setPendingOutputs(new Set(pendingOutputs()).add(id))
    void messages
      .sync(id)
      .catch((error: unknown) => {
        outputRequests.delete(id)
        ctx.toast.show({ variant: "error", title: ctx.t("state.error", { message: message(error) }) })
      })
      .finally(() => {
        const next = new Set(pendingOutputs())
        next.delete(id)
        setPendingOutputs(next)
      })
  }

  const toggleOutput = (id: string) => {
    // Only the twisty calls this, so the swap is always user-driven: focus and scroll may follow it.
    if (openOutput() === id) {
      setOpenOutput(undefined)
      // Solid swaps the views synchronously, so the list's refs are live by this microtask.
      queueMicrotask(() => {
        if (listScroll) listScroll.scrollTop = listScrollTop
        // A row that dropped out of the list has no twisty: leave the focus where it is.
        listTwisties.get(id)?.focus({ preventScroll: true })
      })
      return
    }
    listScrollTop = listScroll?.scrollTop ?? 0
    setOpenOutput(id)
    requestOutput(id)
    queueMicrotask(() => detailTwisty?.focus())
  }

  /** Keeps a handle on the twisty that opened a view, so a swap can hand the focus back or forward. */
  const trackTwisty = (el: HTMLButtonElement, id: string, where: "list" | "detail") => {
    if (where === "detail") {
      detailTwisty = el
      onCleanup(() => {
        if (detailTwisty === el) detailTwisty = undefined
      })
      return
    }
    listTwisties.set(id, el)
    onCleanup(() => {
      // A re-keyed row can mount its replacement before the old node runs cleanup; keep the newer ref.
      if (listTwisties.get(id) === el) listTwisties.delete(id)
    })
  }

  // Shared by the list and the detail header: same twisty, same click target.
  const rowLine = (row: () => Row, where: "list" | "detail") => (
    <div class="sd-rowline">
      <Show when={!row().missing || outputOpen(row().id)}>
        <button
          type="button"
          class="sd-twisty"
          ref={(el) => trackTwisty(el, row().id, where)}
          aria-expanded={outputOpen(row().id)}
          aria-controls={outputOpen(row().id) ? `sd-out-${row().id}` : undefined}
          aria-label={ctx.t(outputOpen(row().id) ? "output.hide" : "output.show")}
          onClick={() => toggleOutput(row().id)}
        >
          {outputOpen(row().id) ? "▾" : "▸"}
        </button>
      </Show>
      <button
        type="button"
        class="sd-row"
        classList={{
          "sd-muted": row().missing,
          "sd-pending": row().pending,
          "sd-deep": row().depth > 0,
        }}
        style={{ "padding-left": `${8 + row().depth * 14}px` }}
        disabled={row().missing}
        aria-hidden={row().ellipsis ? "true" : undefined}
        aria-label={row().ellipsis ? undefined : `${row().agent ?? "—"} · ${row().title} · ${ctx.t(`status.${row().status}`)}`}
        onClick={() => {
          if (row().ellipsis) return
          ctx.tabs.open({ server: props.session.server.id, id: row().id }, { focus: true })
        }}
      >
        <Show when={!row().ellipsis} fallback={<span class="sd-title">…</span>}>
          <span class={`sd-dot sd-dot-${row().status}`} title={ctx.t(`status.${row().status}`)} />
          <span class="sd-agent">{row().agent ?? "—"}</span>
          <span class="sd-title" title={row().title}>
            {row().title}
          </span>
          <span class="sd-num">{rowTokens(row())}</span>
          <span class="sd-num">{rowCost(row())}</span>
          <span class="sd-num sd-time">{rowTime(row(), now())}</span>
        </Show>
      </button>
    </div>
  )

  const rowView = (row: () => Row) => <div class="sd-item">{rowLine(row, "list")}</div>

  return (
    <div class="sd-root">
      <Show
        when={detail()}
        fallback={
          <>
            <Show when={count() > 0}>
              <div class="sd-head">
                <ctx.ui.Switch label={ctx.t("filter.active")} checked={activeOnly()} onChange={setActiveOnly} />
              </div>
            </Show>
            <div class="sd-scroll" ref={(el) => (listScroll = el)}>
              <Show
                when={count() > 0}
                fallback={<div class="sd-empty">{ctx.t(loading() ? "state.loading" : "state.empty")}</div>}
              >
                <Show when={!activeOnly() || activeCount() > 0} fallback={<div class="sd-empty">{ctx.t("filter.empty")}</div>}>
                  <div class="sd-list">
                    <For each={activeIds()}>{(id) => rowView(() => byId().get(id)!)}</For>
                    <Show when={finishedGroup()}>
                      <button
                        type="button"
                        class="sd-group"
                        aria-expanded={finishedExpanded()}
                        onClick={() => setFinishedOpen(!finishedExpanded())}
                      >
                        <span class="sd-caret">{finishedExpanded() ? "▾" : "▸"}</span>
                        {ctx.t("group.finished", { count: finishedCount() })}
                      </button>
                    </Show>
                    <For each={finishedIds()}>{(id) => rowView(() => byId().get(id)!)}</For>
                    <Show when={more() > 0}>
                      <button type="button" class="sd-more" onClick={() => setExpanded(true)}>
                        {ctx.t("state.more", { count: more() })}
                      </button>
                    </Show>
                  </div>
                </Show>
              </Show>
            </div>
          </>
        }
      >
        {(row) => (
          <div class="sd-detail">
            {rowLine(row, "detail")}
            <OutputBlock
              data={props.session.server.data.session}
              id={row().id}
              depth={row().depth}
              pending={pendingOutputs().has(row().id)}
            />
          </div>
        )}
      </Show>
      <Show when={count() > 0}>
        <div class="sd-footer">{ctx.t("footer.summary", footer())}</div>
      </Show>
    </div>
  )
}

export const panelCss = `
.sd-root { box-sizing: border-box; height: 100%; display: flex; flex-direction: column; gap: 8px; padding: 8px; overflow: hidden; font-size: 12px; }
.sd-head { flex: none; }
.sd-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.sd-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.sd-detail > .sd-rowline { flex: none; }
.sd-empty { padding: 12px 8px; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-list { display: flex; flex-direction: column; }
.sd-item { display: block; }
.sd-rowline { display: flex; align-items: center; gap: 2px; }
.sd-twisty { all: unset; flex: none; box-sizing: border-box; width: 16px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 3px; cursor: pointer; font-size: 10px; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-twisty:hover { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-twisty:focus-visible { outline: 1px solid var(--v2-blue-600, #3b82f6); outline-offset: -1px; }
.sd-row { all: unset; display: flex; align-items: center; gap: 6px; box-sizing: border-box; flex: 1 1 auto; min-width: 0; min-height: 22px; padding: 2px 6px; border-radius: 4px; cursor: pointer; }
.sd-row:hover:not(:disabled) { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-row:focus-visible { outline: 1px solid var(--v2-blue-600, #3b82f6); outline-offset: -1px; }
.sd-row:disabled { cursor: default; }
.sd-deep { border-left: 1px solid var(--v2-border-border-base, rgba(127,127,127,.25)); }
.sd-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--v2-text-text-faint, rgba(127,127,127,.7)); }
.sd-dot-running { background: var(--v2-blue-600, #3b82f6); }
.sd-dot-succeeded { background: var(--v2-green-600, #30a46c); }
.sd-dot-failed { background: var(--v2-red-600, #e5484d); }
.sd-dot-interrupted { background: var(--v2-orange-600, #f76b15); }
.sd-agent { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; border-radius: 3px; background: var(--v2-background-bg-muted, rgba(127,127,127,.12)); }
.sd-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-num { flex: none; font-variant-numeric: tabular-nums; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-time { min-width: 34px; text-align: right; }
.sd-out { flex: 1 1 auto; min-height: 0; overflow: auto; box-sizing: border-box; margin: 0; padding: 6px 8px; border-radius: 4px; background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); font-size: 11px; }
.sd-out-state { color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-group { all: unset; display: flex; align-items: center; gap: 4px; box-sizing: border-box; width: 100%; padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 11px; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-group:hover { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-group:focus-visible { outline: 1px solid var(--v2-blue-600, #3b82f6); outline-offset: -1px; }
.sd-caret { flex: none; width: 8px; }
.sd-more { all: unset; padding: 4px 6px; border-radius: 4px; cursor: pointer; color: var(--v2-blue-600, #3b82f6); }
.sd-more:hover { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-more:focus-visible { outline: 1px solid var(--v2-blue-600, #3b82f6); outline-offset: -1px; }
.sd-footer { flex: none; padding: 6px 2px 0; border-top: 1px solid var(--v2-border-border-base, rgba(127,127,127,.25)); color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
.sd-muted { opacity: .55; }
.sd-pending { font-style: italic; opacity: .8; }
.sd-badge { all: unset; display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; color: var(--v2-text-text-base, inherit); }
.sd-badge:hover { background: var(--v2-background-bg-muted, rgba(127,127,127,.08)); }
.sd-badge:focus-visible { outline: 1px solid var(--v2-blue-600, #3b82f6); outline-offset: -1px; }
`
