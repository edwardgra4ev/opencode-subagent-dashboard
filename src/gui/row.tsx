import { Show, createEffect, createMemo } from "solid-js"
import type { MountedSession, SetupContext } from "@opencode/plugin/gui"
import { formatCost, formatElapsed, formatTokens, reasoningBlocks, type Row } from "./model.js"
import type { definition } from "./definition.js"
import { ReasonBlocks, TokenChip } from "./bits.js"

/** What a row needs from the panel: the plugin context, its session, the tick and the list's ref and toggle handlers. */
export type RowUi = {
  ctx: SetupContext<typeof definition>
  readonly session: MountedSession
  now: () => number
  trackRow: (el: HTMLButtonElement, id: string, where: "list" | "detail") => void
  toggleOutput: (id: string) => void
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

/** The three token buckets of a row plus their total. A run with nothing used yet shows one dash instead. */
function tokenGroups(ctx: RowUi["ctx"], row: Row) {
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
export function rowLine(ui: RowUi, row: () => Row, where: "list" | "detail") {
  const { ctx } = ui
  const groups = createMemo(() => tokenGroups(ctx, row()))
  return (
    <div class="sd-rowline">
      <button
        type="button"
        class="sd-row"
        ref={(el) => ui.trackRow(el, row().id, where)}
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
          ui.toggleOutput(row().id)
        }}
      >
        <Show when={!row().ellipsis} fallback={<span class="sd-title">…</span>}>
          <span class={`sd-dot sd-dot-${row().status}`} />
          <span class="sd-agent">{row().agent ?? "—"}</span>
          {/* The full title stays in the row's aria-label; the visible one only ellipsizes. */}
          <span class="sd-title">{row().title}</span>
          <span class="sd-meta">
            <Show when={!groups().dash} fallback={<span class="sd-tok">—</span>}>
              <TokenChip icon="↑" label={groups().inputAria} text={groups().input} />
              <TokenChip icon="↓" label={groups().outputAria} text={groups().output} />
              <TokenChip icon="R" label={groups().cacheReadAria} text={groups().cacheRead} />
              <TokenChip icon="W" label={groups().cacheWriteAria} text={groups().cacheWrite} />
              <span class="sd-num" role="img" aria-label={groups().totalAria}>
                {groups().total}
              </span>
              <span class="sd-num">{rowCost(row())}</span>
              <span class="sd-num sd-time">{rowTime(row(), ui.now())}</span>
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
              ctx.tabs.open({ server: ui.session.server.id, id: row().id }, { focus: true })
            }}
          />
        </ctx.ui.Tooltip>
      </Show>
    </div>
  )
}

export function rowView(ui: RowUi, row: () => Row) {
  const messages = createMemo(() => ui.session.server.data.session.message.list(row().id))
  const blocks = createMemo(() => reasoningBlocks(messages()).slice(-5))
  // One guarded sync on the first running render: the inline panel is read-only, so a failure stays silent
  // (the detail tab owns error reporting).
  let synced = false
  createEffect(() => {
    // A pending stub is not in the client store yet: its sync would reject and burn the one attempt.
    if (row().pending || row().status !== "running" || synced) return
    if (messages().length > 0) {
      synced = true
      return
    }
    synced = true
    void ui.session.server.data.session.message.sync(row().id).catch(() => {})
  })
  return (
    <div class="sd-item">
      {rowLine(ui, row, "list")}
      <Show when={row().status === "running" && blocks().length > 0}>
        <div class="sd-reason" style={{ "margin-left": `${20 + row().depth * 14}px` }}>
          <ReasonBlocks blocks={blocks} />
        </div>
      </Show>
    </div>
  )
}
