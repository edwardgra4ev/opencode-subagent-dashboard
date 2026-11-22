import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type { definition } from "./definition.js"

export function DashboardView(props: { session: MountedSession }) {
  const ctx = usePlugin<typeof definition>()

  return (
    <div class="sd-root">
      <div class="sd-empty">{ctx.t("state.empty")}</div>
    </div>
  )
}

export const panelCss = `
.sd-root { display: flex; flex-direction: column; gap: 8px; height: 100%; padding: 8px; font-size: 12px; }
.sd-empty { padding: 12px 8px; color: var(--v2-text-text-muted, rgba(127,127,127,.9)); }
`
