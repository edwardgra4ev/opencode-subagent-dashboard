import { For, Show, batch, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"
import { createKeyed, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import {
  formatCost,
  formatElapsed,
  formatTokens,
  lastAssistantText,
  userPromptText,
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

function rowCost(row: Row): string {
  return row.status === "running" && row.cost === 0 ? "—" : formatCost(row.cost)
}

/** The two views of a subagent's transcript. */
type OutputTab = "input" | "output"

/** A subagent's prompt and last assistant text, loaded on first expansion, in two tabs. */
function OutputBlock(props: {
  data: SessionData
  id: string
  depth: number
  pending: boolean
  tab: OutputTab
  onTab: (tab: OutputTab) => void
}) {
  const ctx = usePlugin<typeof definition>()
  const messages = createMemo(() => props.data.message.list(props.id))
  const input = createMemo(() => userPromptText(messages()))
  const output = createMemo(() => lastAssistantText(messages()))
  const loading = () => props.data.message.loading(props.id)
  const more = () => props.data.message.more(props.id)
  // Own request state: the store's `loading` may stay false while `loadMore` runs, and a failure must be visible.
  const [busy, setBusy] = createSignal(false)
  const [inputError, setInputError] = createSignal<string | undefined>()
  const [retryTick, setRetryTick] = createSignal(0)
  const waiting = () => props.pending || loading() || busy()
  const text = () => {
    if (props.tab === "output") return output()
    // While history is partial the first user message may be a steering one: wait for the rest instead of showing it.
    return more() ? undefined : input()
  }
  // With older messages on the server the prompt may still be coming: only claim there is none once nothing is left to load.
  const empty = () => {
    if (props.tab === "output") return "output.empty"
    return more() ? "output.loading" : "output.inputEmpty"
  }
  const tabId = (tab: OutputTab) => `sd-tab-${tab}-${props.id}`
  const panelId = () => `sd-out-${props.id}`

  let panel: HTMLDivElement | undefined
  onCleanup(() => (panel = undefined))

  // Both tabs share the panel: switching must start at its top, not where the other tab was left.
  createEffect(() => {
    props.tab
    if (panel) panel.scrollTop = 0
  })

  // The store may hold only the newest messages: fetch the rest so the first prompt is found. A `message.sync` can
  // shrink the window again, hence one extra load per open; an error stops automatic retries until the user retries.
  let loadFor: string | undefined
  let loadCount = 0
  const requestLoad = (id: string) => {
    if (loadFor !== id) {
      loadFor = id
      loadCount = 0
    }
    loadCount++
    setBusy(true)
    void props.data.message
      .loadMore(id, { all: true })
      .catch((error: unknown) => {
        setInputError(ctx.t("output.error", { message: message(error) }))
      })
      .finally(() => setBusy(false))
  }
  createEffect(() => {
    const id = props.id
    retryTick()
    if (props.tab !== "input" || inputError() !== undefined) {
      // The error belongs to the input tab; leaving it drops the stale text.
      if (props.tab !== "input") setInputError(undefined)
      return
    }
    // A sync in flight will re-run this effect; only ask when it is done and history is still partial.
    if (!more() || loading() || busy()) return
    if (loadFor === id && loadCount >= 2) return
    requestLoad(id)
  })

  // Picking the input tab again is the explicit retry: clear the error and give the load another chance.
  const openTab = (tab: OutputTab) => {
    if (tab === "input") {
      loadFor = undefined
      setInputError(undefined)
      setRetryTick((tick) => tick + 1)
    }
    props.onTab(tab)
  }

  const focusTab = (tab: OutputTab) => {
    queueMicrotask(() => document.getElementById(tabId(tab))?.focus({ preventScroll: true }))
  }

  // WAI-ARIA tabs: arrows move between the two, Home/End jump to the first/last, and the inactive one is out of the tab order.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      const next: OutputTab = event.key === "Home" ? "input" : "output"
      props.onTab(next)
      focusTab(next)
      return
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const next: OutputTab = props.tab === "input" ? "output" : "input"
    props.onTab(next)
    focusTab(next)
  }

  const tabButton = (tab: OutputTab) => (
    <button
      type="button"
      role="tab"
      id={tabId(tab)}
      class="sd-tab"
      classList={{ "sd-tab-active": props.tab === tab }}
      aria-selected={props.tab === tab}
      aria-controls={panelId()}
      tabindex={props.tab === tab ? 0 : -1}
      onClick={() => openTab(tab)}
    >
      {ctx.t(tab === "input" ? "output.tab.input" : "output.tab.output")}
    </button>
  )

  return (
    <>
      <div class="sd-tabs" role="tablist" aria-label={ctx.t("output.tabs")} onKeyDown={onKeyDown}>
        {tabButton("input")}
        {tabButton("output")}
      </div>
      <div
        class="sd-out"
        id={panelId()}
        ref={(el) => (panel = el)}
        role="tabpanel"
        aria-labelledby={tabId(props.tab)}
        style={{ "padding-left": `${8 + (props.depth + 1) * 14}px` }}
      >
        <Show
          when={text()}
          fallback={
            <span class="sd-out-state">{inputError() ?? ctx.t(waiting() ? "output.loading" : empty())}</span>
          }
        >
          {(source) => <ctx.ui.Markdown text={source()} />}
        </Show>
      </div>
    </>
  )
}

type PanelUiState = {
  activeOnly: boolean
  finishedOpen: boolean | undefined
  expanded: boolean
  openOutput: string | undefined
  scrollTop: number
}

/** Per-session view state, kept at module level so it survives the host remounting the panel on a tab switch. */
const panelStates = new Map<string, PanelUiState>()

function panelState(key: string): PanelUiState {
  const found = panelStates.get(key)
  if (found) return found
  const created: PanelUiState = { activeOnly: false, finishedOpen: undefined, expanded: false, openOutput: undefined, scrollTop: 0 }
  panelStates.set(key, created)
  return created
}

/** Drops a closed panel's view state: the session no longer shows the panel, so nothing will restore it. */
export function forgetPanelState(sessionKey: string) {
  panelStates.delete(sessionKey)
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

  /** The three token buckets of a row plus their total. A run with nothing used yet shows one dash instead. */
  const tokenGroups = (row: Row) => {
    const tokens = row.tokens
    const cache = tokens.cacheRead + tokens.cacheWrite
    const total = tokens.input + tokens.output + cache
    const empty = tokens.input === 0 && tokens.output === 0 && cache === 0
    const input = formatTokens(tokens.input)
    const output = formatTokens(tokens.output)
    const cacheRead = formatTokens(tokens.cacheRead)
    const cacheWrite = formatTokens(tokens.cacheWrite)
    const sum = formatTokens(total)
    return {
      dash: empty && (row.status === "running" || row.pending),
      input,
      output,
      cacheRead,
      cacheWrite,
      total: sum,
      aria: `${ctx.t("row.breakdown", { input, output, cache: formatTokens(cache) })} · ${ctx.t("footer.total")} ${sum}`,
      inputAria: `${ctx.t("token.input")} ${input}`,
      outputAria: `${ctx.t("token.output")} ${output}`,
      cacheReadAria: `${ctx.t("token.cacheRead")} ${cacheRead}`,
      cacheWriteAria: `${ctx.t("token.cacheWrite")} ${cacheWrite}`,
      totalAria: `${ctx.t("footer.total")} ${sum}`,
    }
  }

  // Shared by the list and the detail header: the row toggles the detail, the trailing button opens the chat.
  const rowLine = (row: () => Row, where: "list" | "detail") => {
    const groups = createMemo(() => tokenGroups(row()))
    return (
      <div class="sd-rowline">
        <button
          type="button"
          class="sd-row"
          ref={(el) => trackRow(el, row().id, where)}
          aria-expanded={where === "detail"}
          classList={{
            "sd-muted": row().missing,
            "sd-pending": row().pending,
            "sd-deep": row().depth > 0,
          }}
          style={{ "padding-left": `${8 + row().depth * 14}px` }}
          disabled={row().missing && where !== "detail"}
          aria-hidden={row().ellipsis ? "true" : undefined}
          aria-label={
            row().ellipsis
              ? undefined
              : `${row().agent ?? "—"} · ${row().title} · ${ctx.t(`status.${row().status}`)} · ${groups().aria}`
          }
          onClick={() => {
            if (row().ellipsis) return
            toggleOutput(row().id)
          }}
        >
          <Show when={!row().ellipsis} fallback={<span class="sd-title">…</span>}>
            <span class={`sd-dot sd-dot-${row().status}`} />
            <span class="sd-agent">{row().agent ?? "—"}</span>
            {/* The full title stays in the row's aria-label; the visible one only ellipsizes. */}
            <span class="sd-title">{row().title}</span>
            <span class="sd-meta">
              <Show when={!groups().dash} fallback={<span class="sd-tok">—</span>}>
                <span class="sd-tok" role="img" aria-label={groups().inputAria}>
                  <span class="sd-tok-icon" aria-hidden="true">↑</span>
                  <span class="sd-tok-text">{groups().input}</span>
                </span>
                <span class="sd-tok" role="img" aria-label={groups().outputAria}>
                  <span class="sd-tok-icon" aria-hidden="true">↓</span>
                  <span class="sd-tok-text">{groups().output}</span>
                </span>
                <span class="sd-tok" role="img" aria-label={groups().cacheReadAria}>
                  <span class="sd-tok-icon" aria-hidden="true">R</span>
                  <span class="sd-tok-text">{groups().cacheRead}</span>
                </span>
                <span class="sd-tok" role="img" aria-label={groups().cacheWriteAria}>
                  <span class="sd-tok-icon" aria-hidden="true">W</span>
                  <span class="sd-tok-text">{groups().cacheWrite}</span>
                </span>
                <span class="sd-num" role="img" aria-label={groups().totalAria}>
                  {groups().total}
                </span>
                <span class="sd-num">{rowCost(row())}</span>
                <span class="sd-num sd-time">{rowTime(row(), now())}</span>
              </Show>
            </span>
          </Show>
        </button>
        <Show when={!row().ellipsis}>
          <ctx.ui.Tooltip value={ctx.t("row.openChat")}>
            <ctx.ui.IconButton
              class="sd-open"
              icon="square-arrow-top-right"
              size="small"
              variant="ghost-muted"
              label={ctx.t("row.openChat")}
              disabled={row().missing}
              onClick={(event) => {
                event.stopPropagation()
                ctx.tabs.open({ server: props.session.server.id, id: row().id }, { focus: true })
              }}
            />
          </ctx.ui.Tooltip>
        </Show>
      </div>
    )
  }

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
          <span class="sd-tok" role="img" aria-label={`${ctx.t("token.input")} ${footer().input}`}>
            <span class="sd-tok-icon" aria-hidden="true">↑</span>
            <span class="sd-tok-text">{footer().input}</span>
          </span>
          <span class="sd-footer-sep" aria-hidden="true">·</span>
          <span class="sd-tok" role="img" aria-label={`${ctx.t("token.output")} ${footer().output}`}>
            <span class="sd-tok-icon" aria-hidden="true">↓</span>
            <span class="sd-tok-text">{footer().output}</span>
          </span>
          <span class="sd-footer-sep" aria-hidden="true">·</span>
          <span class="sd-tok" role="img" aria-label={`${ctx.t("token.cacheRead")} ${footer().cacheRead}`}>
            <span class="sd-tok-icon" aria-hidden="true">R</span>
            <span class="sd-tok-text">{footer().cacheRead}</span>
          </span>
          <span class="sd-footer-sep" aria-hidden="true">·</span>
          <span class="sd-tok" role="img" aria-label={`${ctx.t("token.cacheWrite")} ${footer().cacheWrite}`}>
            <span class="sd-tok-icon" aria-hidden="true">W</span>
            <span class="sd-tok-text">{footer().cacheWrite}</span>
          </span>
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
`
