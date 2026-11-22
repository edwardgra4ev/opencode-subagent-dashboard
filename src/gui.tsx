import { Command, MenuItem, Panel, Plugin, Slot, Style, createKeyed, type PanelTab } from "@opencode/plugin/gui"
import { definition } from "./gui/definition.js"
import { DashboardView, panelCss } from "./gui/dashboard.js"
import { AgentsBadge } from "./gui/badge.js"

export default Plugin.define({
  ...definition,
  setup(ctx) {
    const key = `${ctx.id}:agents`
    // The user keeps the panel open: the host stores tabs per session, so a new session would otherwise start closed.
    // Kept in memory only, so a Desktop restart starts closed again.
    let pinned = false
    const pin = () => {
      pinned = true
    }

    const current = ctx.sessions.current()
    if (current && ctx.layout.state(key, current) !== "closed") pinned = true
    if (
      !pinned &&
      ctx.layout.ready() &&
      ctx.sessions.list().some((session) => ctx.layout.state(key, session) !== "closed")
    )
      pinned = true

    // Every routing gives a new session object; reopen the tab if the user pinned it and this session lacks it.
    createKeyed(
      () => ctx.sessions.current(),
      (session) => {
        if (pinned && ctx.layout.state(key, session) === "closed") ctx.layout.open(key, session)
      },
    )

    const tab: PanelTab = {
      id: "agents",
      get title() {
        return ctx.t("panel.title")
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
      close: () => {
        pinned = false
      },
    }

    ctx.add(Panel, panel)
    ctx.add(Style, panelCss)
    ctx.add(Slot, { at: "window.bottom", render: () => <AgentsBadge onOpen={pin} /> })
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
