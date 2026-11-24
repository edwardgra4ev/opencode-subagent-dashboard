import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { lastAssistantText, reasoningBlocks, userPromptText, type SessionData } from "./model.js"
import type { definition } from "./definition.js"
import { ReasonBlocks } from "./bits.js"

/** A caught error's text, whether it is an `Error`, a `{ message }` object or a raw value. */
export function message(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error && "message" in error) return String(error.message)
  return String(error)
}

/** The three views of a subagent's transcript. */
export type OutputTab = "input" | "output" | "reasoning"

/** A subagent's prompt, reasoning blocks and last assistant text, loaded on first expansion, in three tabs. */
export function OutputBlock(props: {
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
  const blocks = createMemo(() => reasoningBlocks(messages()))
  const loading = () => props.data.message.loading(props.id)
  const more = () => props.data.message.more(props.id)
  // Own request state: the store's `loading` may stay false while `loadMore` runs, and a failure must be visible.
  const [busy, setBusy] = createSignal(false)
  const [loadError, setLoadError] = createSignal<string | undefined>()
  const [retryTick, setRetryTick] = createSignal(0)
  const waiting = () => props.pending || loading() || busy()
  // The list is index-keyed, so a history load prepending blocks would rebind an open block: mount it only when settled.
  const settled = () => !waiting() && !more()
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

  // All three tabs share the panel: switching must start at its top, not where another tab was left.
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
        setLoadError(ctx.t("output.error", { message: message(error) }))
      })
      .finally(() => setBusy(false))
  }
  createEffect(() => {
    const id = props.id
    retryTick()
    // Both history tabs read the same window, so both may need the older messages.
    const historyTab = props.tab === "input" || props.tab === "reasoning"
    if (!historyTab || loadError() !== undefined) {
      // The error belongs to the history tabs; leaving them drops the stale text.
      if (!historyTab) setLoadError(undefined)
      return
    }
    // A sync in flight will re-run this effect; only ask when it is done and history is still partial.
    if (!more() || loading() || busy()) return
    if (loadFor === id && loadCount >= 2) return
    requestLoad(id)
  })

  // Picking a history tab again is the explicit retry: clear the error and give the load another chance.
  const openTab = (tab: OutputTab) => {
    if (tab === "input" || tab === "reasoning") {
      loadFor = undefined
      setLoadError(undefined)
      setRetryTick((tick) => tick + 1)
    }
    props.onTab(tab)
  }

  const focusTab = (tab: OutputTab) => {
    queueMicrotask(() => document.getElementById(tabId(tab))?.focus({ preventScroll: true }))
  }

  // WAI-ARIA tabs: arrows cycle through the three, Home/End jump to the first/last, and the inactive ones are out of the tab order.
  const tabs: OutputTab[] = ["input", "reasoning", "output"]
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      // Keyboard activation goes through `openTab` too, so the history retry resets like a mouse click.
      const next: OutputTab = event.key === "Home" ? "input" : "output"
      openTab(next)
      focusTab(next)
      return
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const step = event.key === "ArrowRight" ? 1 : -1
    const next = tabs[(tabs.indexOf(props.tab) + step + tabs.length) % tabs.length]!
    openTab(next)
    focusTab(next)
  }

  const tabLabel = (tab: OutputTab) =>
    ctx.t(tab === "input" ? "output.tab.input" : tab === "output" ? "output.tab.output" : "output.tab.reasoning")

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
      {tabLabel(tab)}
    </button>
  )

  return (
    <>
      <div class="sd-tabs" role="tablist" aria-label={ctx.t("output.tabs")} onKeyDown={onKeyDown}>
        {tabButton("input")}
        {tabButton("reasoning")}
        {tabButton("output")}
      </div>
      <div
        class="sd-out"
        id={panelId()}
        ref={(el) => (panel = el)}
        role="tabpanel"
        aria-labelledby={tabId(props.tab)}
        tabIndex={0}
        style={{ "padding-left": `${8 + (props.depth + 1) * 14}px` }}
      >
        <Show
          when={props.tab === "reasoning"}
          fallback={
            <Show
              when={text()}
              fallback={
                <span class="sd-out-state">{loadError() ?? ctx.t(waiting() ? "output.loading" : empty())}</span>
              }
            >
              {(source) => <ctx.ui.Markdown text={source()} />}
            </Show>
          }
        >
          <Show
            when={loadError()}
            fallback={
              <Show
                when={settled()}
                fallback={<span class="sd-out-state">{ctx.t("reasoning.loading")}</span>}
              >
                <Show
                  when={blocks().length > 0}
                  fallback={<span class="sd-out-state">{ctx.t("reasoning.empty")}</span>}
                >
                  <ReasonBlocks blocks={blocks} />
                </Show>
              </Show>
            }
          >
            {(error) => <span class="sd-out-state">{error()}</span>}
          </Show>
        </Show>
      </div>
    </>
  )
}
