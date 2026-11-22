import { Command, MenuItem, Panel, Plugin, Style, createKeyed, type PanelTab } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal } from "solid-js"
import { definition } from "./gui/definition.js"
import { DashboardView, forgetPanelState, panelCss } from "./gui/dashboard.js"
import { visibleRows, type AgentStatus } from "./gui/model.js"

type Snapshot = { status: AgentStatus; title: string; agent?: string; endedAt?: number; busyAt?: number }

/** Statuses worth a notification; `idle` is a waypoint, not an end. */
const TERMINAL: ReadonlySet<AgentStatus> = new Set(["succeeded", "failed", "interrupted"])

export default Plugin.define({
  ...definition,
  setup(ctx) {
    const key = `${ctx.id}:agents`
    // The user keeps the panel open: the host stores tabs per session, so a new session would otherwise start closed.
    // Restored once from the persisted layout after it mounts: before that `ready()` is false and there is no
    // current session, so a read in `setup` would always start unpinned.
    let pinned = false
    const pin = () => {
      pinned = true
    }

    let initialized = false
    createEffect(() => {
      if (initialized) return
      if (!ctx.layout.ready()) return
      const current = ctx.sessions.current()
      if (!current) return
      initialized = true
      pinned =
        ctx.layout.state(key, current) !== "closed" ||
        ctx.sessions.list().some((session) => ctx.layout.state(key, session) !== "closed")
      // Pinned but closed in the restored current session: open it once here, so no tab switch is needed after a restart.
      // `append` keeps the selection and the preview slot: the restore must not steal another panel's tab.
      if (pinned && ctx.layout.state(key, current) === "closed") {
        ctx.layout.open(key, current, { tab: "append" })
      }
    })

    // Every routing gives a new session object; reopen the tab if the user pinned it and this session lacks it.
    createKeyed(
      () => ctx.sessions.current(),
      (session) => {
        if (pinned && ctx.layout.state(key, session) === "closed") {
          ctx.layout.open(key, session, { tab: "append" })
        }
      },
    )

    // The routed session's rows, computed once per update: the running count and the notification snapshot share it.
    const currentRows = createMemo(() => {
      const current = ctx.sessions.current()
      return current ? visibleRows(current.server.data.session, current) : undefined
    })

    // Running count for the tab title, so a background subagent is visible without the window-bottom strip.
    const [running, setRunning] = createSignal(0)
    createEffect(() => {
      setRunning(currentRows()?.filter((row) => row.status === "running").length ?? 0)
    })

    // Last snapshot of the routed session's rows: a row that reaches a terminal status after another one notifies,
    // a first sight of a row or a session does not. The old strip owned this; the panel itself is per session now.
    let snapshot = new Map<string, Snapshot>()
    let route: string | undefined
    createEffect(() => {
      const current = ctx.sessions.current()
      const rows = currentRows()
      const next = new Map<string, Snapshot>()
      if (current && rows) {
        for (const row of rows) {
          if (row.ellipsis) continue
          next.set(row.id, {
            status: row.status,
            title: row.title,
            agent: row.agent,
            endedAt: row.endedAt,
            busyAt: row.busyAt,
          })
        }
      }
      const previous = current?.key === route ? snapshot : undefined
      route = current?.key
      snapshot = next
      if (!current || !previous) return
      for (const [id, row] of next) {
        const prior = previous.get(id)
        if (!prior || prior.status === row.status || !TERMINAL.has(row.status)) continue
        void ctx.attention.notify({
          title: ctx.t("notify.done", { title: row.title }),
          message: row.agent,
          variant: row.status === "failed" ? "error" : "default",
          session: { server: current.server.id, id },
          id: `${current.id}:${id}:${row.status}:${row.endedAt ?? row.busyAt ?? 0}`,
        })
      }
    })

    const tab: PanelTab = {
      id: "agents",
      get title() {
        const count = running()
        return count > 0 ? `${ctx.t("panel.title")} · ${count}` : ctx.t("panel.title")
      },
      closable: "compact",
      fallback: true,
    }

    const panel: Panel = {
      id: "agents",
      region: "side",
      width: 360,
      mobile: {
        get title() {
          return ctx.t("panel.title")
        },
        order: 62,
        kind: "menu",
        icon: "fork",
      },
      list: (input) => (pinned || input.open.includes("agents") ? [tab] : []),
      render: (props) => <DashboardView session={props.session} />,
      close: (input) => {
        pinned = false
        // The panel's view state belongs to a session that no longer shows it: drop it so closing tabs does not leak.
        forgetPanelState(input.session.key)
      },
    }

    ctx.add(Panel, panel)
    ctx.add(Style, panelCss)
    ctx.add(
      MenuItem,
      (): MenuItem => {
        const session = ctx.sessions.current()
        return {
          menu: "session.panel",
          id: "open",
          title: ctx.t("menu.open"),
          icon: "fork",
          keybind: `${ctx.id}.open`,
          opened: !!session && ctx.layout.state(key, session) !== "closed",
          run: () => {
            const current = ctx.sessions.current()
            pin()
            if (current) ctx.layout.open(key, current)
          },
        }
      },
    )
    ctx.add(
      Command,
      (): Command => ({
        id: "open",
        title: ctx.t("command.open"),
        slash: { name: "agents" },
        enabled: !!ctx.sessions.current(),
        run: () => {
          const current = ctx.sessions.current()
          pin()
          if (current) ctx.layout.open(key, current)
        },
      }),
    )
  },
})
