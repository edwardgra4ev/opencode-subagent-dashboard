import type { ServerRef } from "@opencode/plugin/gui"

export type SessionInfo = ReturnType<ServerRef["data"]["session"]["list"]>[number]

export type SessionMessageInfo = ReturnType<ServerRef["data"]["session"]["message"]["list"]>[number]

export type AgentStatus = "running" | "succeeded" | "failed" | "interrupted" | "idle"

export type Row = {
  id: string
  parentID?: string
  depth: number
  agent?: string
  title: string
  status: AgentStatus
  outcome?: "succeeded" | "failed" | "interrupted"
  tokens: { input: number; output: number }
  cost: number
  startedAt: number
  endedAt?: number
  busyAt?: number
  missing: boolean
  pending: boolean
  /** A synthetic "children not shown" marker under a row at `MAX_DEPTH`. */
  ellipsis?: boolean
}

export type BuildDeps = {
  status(id: string): "idle" | "running"
  missing(id: string): boolean
}

/** Deepest row depth; rows below it are not expanded. */
const MAX_DEPTH = 3

function toRow(info: SessionInfo, depth: number, deps: BuildDeps): Row {
  return {
    id: info.id,
    parentID: info.parentID,
    depth,
    agent: info.agent,
    title: info.title?.trim() || info.agent || info.id,
    status: deps.status(info.id) === "running" ? "running" : (info.outcome ?? "idle"),
    outcome: info.outcome,
    tokens: { input: info.tokens.input, output: info.tokens.output },
    cost: info.cost,
    startedAt: info.time.created,
    endedAt: info.time.idle,
    busyAt: info.time.busy,
    missing: deps.missing(info.id),
    pending: false,
  }
}

/** Marker under a row at `MAX_DEPTH`, telling that its children are not expanded. */
function ellipsisRow(parent: Row): Row {
  return {
    id: `${parent.id}:ellipsis`,
    parentID: parent.id,
    depth: parent.depth + 1,
    title: "…",
    status: "idle",
    tokens: { input: 0, output: 0 },
    cost: 0,
    startedAt: 0,
    missing: true,
    pending: false,
    ellipsis: true,
  }
}

/** Stable: running first, then newest `startedAt` first. Does not mutate `rows`. */
export function sortRows<T extends { status: AgentStatus; startedAt: number }>(rows: T[]): T[] {
  const rank = (row: T) => (row.status === "running" ? 0 : 1)
  return [...rows].sort((a, b) => rank(a) - rank(b) || b.startedAt - a.startedAt)
}

/** All descendants of `rootID` by `parentID`, DFS; direct children have depth 0. */
export function buildTree(infos: SessionInfo[], rootID: string, deps: BuildDeps): Row[] {
  const children = new Map<string, SessionInfo[]>()
  for (const info of infos) {
    if (!info.parentID) continue
    const siblings = children.get(info.parentID)
    if (siblings) siblings.push(info)
    else children.set(info.parentID, [info])
  }

  const rows: Row[] = []
  const seen = new Set<string>([rootID])

  const walk = (parentID: string, depth: number) => {
    if (depth > MAX_DEPTH) return
    const siblings = children.get(parentID)
    if (!siblings) return
    for (const row of sortRows(siblings.map((info) => toRow(info, depth, deps)))) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      rows.push(row)
      if (depth === MAX_DEPTH && children.has(row.id)) rows.push(ellipsisRow(row))
      walk(row.id, depth + 1)
    }
  }

  walk(rootID, 0)
  return rows
}

export type SessionData = ServerRef["data"]["session"]

/** The session's rows as the panel shows them: the store tree plus background subagents not in the store yet. */
export function visibleRows(
  data: SessionData,
  session: { readonly id: string; readonly background: readonly { id: string; type: string; label: string; agent?: string }[] },
): Row[] {
  const deps: BuildDeps = {
    status: (id) => data.status(id),
    missing: (id) => data.missing(id),
  }
  return mergeBackground(buildTree(data.list(), session.id, deps), session.background)
}

/** Adds running `background` subagents that are not in the store yet, pending rows first. */
export function mergeBackground(
  rows: Row[],
  tasks: readonly { id: string; type: string; label: string; agent?: string }[],
): Row[] {
  const known = new Set(rows.map((row) => row.id))
  const pending: Row[] = []
  for (const task of tasks) {
    if (task.type !== "subagent" || known.has(task.id)) continue
    known.add(task.id)
    pending.push({
      id: task.id,
      depth: 0,
      agent: task.agent,
      title: task.label || task.agent || task.id,
      status: "running",
      tokens: { input: 0, output: 0 },
      cost: 0,
      startedAt: 0,
      missing: false,
      pending: true,
    })
  }
  // Keep `rows` in `buildTree`'s DFS order: a child must stay under its parent, and each level is already sorted.
  return [...pending, ...rows]
}

/** The text of the last assistant message: its `text` parts joined, reasoning and tool calls skipped. */
export function lastAssistantText(messages: readonly SessionMessageInfo[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (!message || message.type !== "assistant") continue
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n")
      .trim()
    return text || undefined
  }
  return undefined
}

export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0"
  if (n < 1000) return String(Math.round(n))
  const scaled = n < 999_950 ? n / 1e3 : n / 1e6
  const unit = n < 999_950 ? "k" : "M"
  const text = scaled.toFixed(1)
  return `${text.endsWith(".0") ? text.slice(0, -2) : text}${unit}`
}

export function formatCost(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0"
  if (n < 0.01) return "<$0.01"
  return `$${n.toFixed(2)}`
}

export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return "0s"
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h${String(minutes % 60).padStart(2, "0")}m`
}
