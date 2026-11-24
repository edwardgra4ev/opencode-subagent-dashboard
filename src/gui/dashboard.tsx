import { For, Show, batch, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"
import { createKeyed, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { formatCost, formatTokens, visibleRows, type Row } from "./model.js"
import type { definition } from "./definition.js"
import { TokenChip } from "./bits.js"
import { OutputBlock, message, type OutputTab } from "./output.js"
import { rowLine, rowView, type RowUi } from "./row.js"
import { panelState } from "./panel-state.js"

/** Rows rendered before the list asks whether to show the rest. */
const ROW_LIMIT = 200
/** Finished groups up to this size start expanded. */
const FINISHED_AUTO_LIMIT = 5

/** Ellipsis markers are not rows the user can pick or count; the truncation count needs no filtered copy. */
function nonEllipsisCount(rows: readonly Row[]): number {
  let count = 0
  for (const row of rows) if (!row.ellipsis) count++
  return count
}


export function DashboardView(props: { session: MountedSession }) {
  const ctx = usePlugin<typeof definition>()
  const [loading, setLoading] = createSignal(true)
  const [now, setNow] = createSignal(Date.now())
  const initial = panelState(props.session.key)
  const [activeOnly, setActiveOnly] = createSignal(initial.activeOnly)
  const [expanded, setExpanded] = createSignal(initial.expanded)
  const [finishedOpen, setFinishedOpen] = createSignal<boolean | undefined>(initial.finishedOpen)
  // One output at a time: opening another row closes the previous one (accordion).
  const [openOutput, setOpenOutput] = createSignal<string | undefined>(initial.openOutput)
  // The transcript opens on the answer; another output, another session or a close resets it.
  const [outputTab, setOutputTab] = createSignal<OutputTab>("output")
  const [pendingOutputs, setPendingOutputs] = createSignal<ReadonlySet<string>>(new Set<string>())
  // Sessions whose messages were already asked for; a failure drops the id so a later expansion retries.
  const outputRequests = new Set<string>()

  // The detail replaces the list, so the list's scroll and its row buttons are parked here across the swap.
  let listScroll: HTMLDivElement | undefined
  let detailRow: HTMLButtonElement | undefined
  const listRows = new Map<string, HTMLButtonElement>()
  // The session the refs above belong to; set on the first keyed run, compared on every later one.
  let boundKey: string | undefined

  // The UI signals mirror the session's entry: written on every change, read back on mount and on key change.
  // The key guard keeps a stale write from landing in the entry of a session the panel just switched to.
  let persistedKey: string | undefined
  createEffect(() => {
    const values = {
      activeOnly: activeOnly(),
      finishedOpen: finishedOpen(),
      expanded: expanded(),
      openOutput: openOutput(),
    }
    const key = props.session.key
    if (key !== persistedKey) {
      persistedKey = key
      return
    }
    const target = panelState(key)
    target.activeOnly = values.activeOnly
    target.finishedOpen = values.finishedOpen
    target.expanded = values.expanded
    target.openOutput = values.openOutput
  })

  // Only the load state and the output requests are per visit: the view state comes from the session's entry.
  createKeyed(
    () => props.session.key,
    (key) => {
      const state = panelState(key)
      // Refs of the previous session's nodes must not outlive the swap; the first run has none of this session's yet.
      if (boundKey !== undefined && boundKey !== key) {
        listScroll = undefined
        detailRow = undefined
        listRows.clear()
      }
      boundKey = key
      batch(() => {
        setActiveOnly(state.activeOnly)
        setExpanded(state.expanded)
        setFinishedOpen(state.finishedOpen)
        setOpenOutput(state.openOutput)
        setOutputTab("output")
        setPendingOutputs(new Set<string>())
        outputRequests.clear()
      })
      // The list may be unmounted here (a detail is open): the restoring read after the swap uses the entry too.
      queueMicrotask(() => {
        if (listScroll) listScroll.scrollTop = state.scrollTop
      })
    },
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

  const anyRunning = createMemo(() => rows().some((row) => row.status === "running"))

  // Tick only while something runs. Reads `anyRunning()`, never `now()`, so the effect does not restart every second.
  createEffect(() => {
    if (!anyRunning()) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  // An ellipsis marker stays right after its parent, so it joins its parent's list rather than the finished group.
  // Both counts come from this same pass: an ellipsis marker is not a row the user can pick or count.
  const split = createMemo(() => {
    const running: Row[] = []
    const done: Row[] = []
    let runningCount = 0
    let doneCount = 0
    let target = done
    for (const row of rows()) {
      if (!row.ellipsis) target = row.status === "running" ? running : done
      target.push(row)
      if (row.ellipsis) continue
      if (target === running) runningCount++
      else doneCount++
    }
    return { running, done, runningCount, doneCount }
  })
  const active = createMemo(() => split().running)
  const finished = createMemo(() => split().done)
  const count = createMemo(() => split().runningCount + split().doneCount)
  const activeCount = createMemo(() => split().runningCount)
  const finishedCount = createMemo(() => split().doneCount)

  const footer = createMemo(() => {
    let input = 0
    let output = 0
    let read = 0
    let write = 0
    let cost = 0
    for (const row of rows()) {
      if (row.ellipsis) continue
      input += row.tokens.input
      output += row.tokens.output
      read += row.tokens.cacheRead
      write += row.tokens.cacheWrite
      cost += row.cost
    }
    const cache = read + write
    return {
      count: count(),
      input: formatTokens(input),
      output: formatTokens(output),
      cacheRead: formatTokens(read),
      cacheWrite: formatTokens(write),
      total: formatTokens(input + output + cache),
      cost: formatCost(cost),
    }
  })

  const finishedExpanded = () => finishedOpen() ?? finishedCount() <= FINISHED_AUTO_LIMIT

  const visible = createMemo(() => {
    if (activeOnly()) return active().filter((row) => !row.ellipsis)
    return finishedExpanded() ? [...active(), ...finished()] : active()
  })

  const shown = createMemo(() => {
    const all = visible()
    return expanded() || all.length <= ROW_LIMIT ? all : all.slice(0, ROW_LIMIT)
  })
  const more = createMemo(() => nonEllipsisCount(visible()) - nonEllipsisCount(shown()))
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

  // The open output replaces the list; a gone row (deleted session) falls back to the list.
  const detail = createMemo(() => {
    const id = openOutput()
    return id === undefined ? undefined : byId().get(id)
  })

  createEffect(() => {
    // Before the first sync the list is empty, so a restored output must not be dropped: the effect re-runs once rows land.
    if (count() === 0) return
    const id = openOutput()
    if (id !== undefined && !byId().has(id)) {
      setOpenOutput(undefined)
      setOutputTab("output")
    }
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
        ctx.toast.show({ variant: "error", title: ctx.t("output.error", { message: message(error) }) })
      })
      .finally(() => {
        const next = new Set(pendingOutputs())
        next.delete(id)
        setPendingOutputs(next)
      })
  }

  // An output restored from the panel state mounts without a click, so it must load its messages itself.
  // Keyed by the detail's id: row updates while it is open must not retry a failed sync.
  let requestedDetail: string | undefined
  createEffect(() => {
    const id = detail()?.id
    if (id === undefined) {
      requestedDetail = undefined
      return
    }
    if (id === requestedDetail) return
    requestedDetail = id
    untrack(() => requestOutput(id))
  })

  const toggleOutput = (id: string) => {
    // The row itself calls this: the swap is user-driven, so focus and scroll may follow it.
    if (openOutput() === id) {
      setOpenOutput(undefined)
      setOutputTab("output")
      // Solid swaps the views synchronously, so the list's refs are live by this microtask.
      queueMicrotask(() => {
        if (listScroll) listScroll.scrollTop = panelState(props.session.key).scrollTop
        // A row that dropped out of the list has no button: leave the focus where it is.
        listRows.get(id)?.focus({ preventScroll: true })
      })
      return
    }
    panelState(props.session.key).scrollTop = listScroll?.scrollTop ?? 0
    setOpenOutput(id)
    setOutputTab("output")
    requestOutput(id)
    queueMicrotask(() => detailRow?.focus())
  }

  /** Keeps a handle on the row button that opened a view, so a swap can hand the focus back or forward. */
  const trackRow = (el: HTMLButtonElement, id: string, where: "list" | "detail") => {
    if (where === "detail") {
      detailRow = el
      onCleanup(() => {
        if (detailRow === el) detailRow = undefined
      })
      return
    }
    listRows.set(id, el)
    onCleanup(() => {
      // A re-keyed row can mount its replacement before the old node runs cleanup; keep the newer ref.
      if (listRows.get(id) === el) listRows.delete(id)
    })
  }

  // The rows live in their own module: they get the live session through a getter, so a swap needs no rebuild.
  const rowUi: RowUi = {
    ctx,
    get session() {
      return props.session
    },
    now,
    trackRow,
    toggleOutput,
  }

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
            <div
              class="sd-scroll"
              ref={(el) => (listScroll = el)}
              onScroll={(event) => {
                panelState(props.session.key).scrollTop = event.currentTarget.scrollTop
              }}
            >
              <Show
                when={count() > 0}
                fallback={<div class="sd-empty">{ctx.t(loading() ? "state.loading" : "state.empty")}</div>}
              >
                <Show when={!activeOnly() || activeCount() > 0} fallback={<div class="sd-empty">{ctx.t("filter.empty")}</div>}>
                  <div class="sd-list">
                    <For each={activeIds()}>{(id) => rowView(rowUi, () => byId().get(id)!)}</For>
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
                    <For each={finishedIds()}>{(id) => rowView(rowUi, () => byId().get(id)!)}</For>
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
            {rowLine(rowUi, row, "detail")}
            <OutputBlock
              data={props.session.server.data.session}
              id={row().id}
              depth={row().depth}
              pending={pendingOutputs().has(row().id)}
              tab={outputTab()}
              onTab={setOutputTab}
            />
          </div>
        )}
      </Show>
      <Show when={count() > 0}>
        <div class="sd-footer" role="group" aria-label={ctx.t("footer.summary", footer())}>
          <span>{ctx.t("footer.agents", { count: footer().count })}</span>
          <span class="sd-footer-sep" aria-hidden="true">·</span>
          <TokenChip icon="↑" label={`${ctx.t("token.input")} ${footer().input}`} text={footer().input} />
          <span class="sd-footer-sep" aria-hidden="true">·</span>
          <TokenChip icon="↓" label={`${ctx.t("token.output")} ${footer().output}`} text={footer().output} />
          <span class="sd-footer-sep" aria-hidden="true">·</span>
          <TokenChip icon="R" label={`${ctx.t("token.cacheRead")} ${footer().cacheRead}`} text={footer().cacheRead} />
          <span class="sd-footer-sep" aria-hidden="true">·</span>
          <TokenChip icon="W" label={`${ctx.t("token.cacheWrite")} ${footer().cacheWrite}`} text={footer().cacheWrite} />
          <span class="sd-footer-sep" aria-hidden="true">·</span>
          <span class="sd-tok" role="img" aria-label={`${ctx.t("footer.total")} ${footer().total}`}>
            <span class="sd-tok-text">
              {ctx.t("footer.total")} {footer().total}
            </span>
          </span>
          <span class="sd-footer-sep" aria-hidden="true">·</span>
          <span class="sd-num">{footer().cost}</span>
        </div>
      </Show>
    </div>
  )
}
