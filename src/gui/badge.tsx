import { Show, createEffect, createMemo } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { visibleRows, type AgentStatus } from "./model.js"
import type { definition } from "./definition.js"

type Snapshot = { status: AgentStatus; title: string; agent?: string }

export function AgentsBadge() {
  const ctx = usePlugin<typeof definition>()
  const session = () => ctx.sessions.current()

  const rows = createMemo(() => {
    const current = session()
    return current ? visibleRows(current.server.data.session, current) : []
  })
  const running = createMemo(() => rows().filter((row) => row.status === "running"))
  const label = () => ctx.t("badge.label", { count: running().length })

  // Last snapshot of the routed session's rows: a transition running → finished notifies, a first sight of a row does not.
  let snapshot = new Map<string, Snapshot>()
  let route: string | undefined

  createEffect(() => {
    const current = session()
    const next = new Map<string, Snapshot>()
    for (const row of rows()) next.set(row.id, { status: row.status, title: row.title, agent: row.agent })
    const previous = current?.key === route ? snapshot : undefined
    route = current?.key
    snapshot = next
    if (!current || !previous) return
    for (const [id, row] of next) {
      if (previous.get(id)?.status !== "running" || row.status === "running") continue
      void ctx.attention.notify({
        title: ctx.t("notify.done", { title: row.title }),
        message: row.agent,
        variant: row.status === "failed" ? "error" : "default",
        session: { server: current.server.id, id },
        id: `${current.id}:${id}:${row.status}`,
      })
    }
  })

  const open = () => {
    const current = session()
    if (current) ctx.layout.open(`${ctx.id}:agents`, current)
  }

  return (
    <Show when={running().length > 0}>
      <button type="button" class="sd-badge" title={label()} aria-label={label()} onClick={open}>
        ⚡ {running().length}
      </button>
    </Show>
  )
}
