import { Command, MenuItem, Panel, Plugin, Slot, Style, type PanelTab } from "@opencode/plugin/gui"
import { definition } from "./gui/definition.js"
import { DashboardView, panelCss } from "./gui/dashboard.js"
import { AgentsBadge } from "./gui/badge.js"

export default Plugin.define({
  ...definition,
  setup(ctx) {
    const key = `${ctx.id}:agents`

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
      list: (input) => (input.open.includes("agents") ? [tab] : []),
      render: (props) => <DashboardView session={props.session} />,
    }

    ctx.add(Panel, panel)
    ctx.add(Style, panelCss)
    ctx.add(Slot, { at: "window.bottom", render: () => <AgentsBadge /> })
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
          const session = ctx.sessions.current()
          if (session) ctx.layout.open(key, session)
        },
      }),
    )
  },
})
