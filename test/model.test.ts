import { describe, expect, it } from "vitest"
import {
  buildTree,
  formatCost,
  formatElapsed,
  formatTokens,
  lastAssistantText,
  mergeBackground,
  reasoningBlocks,
  sortRows,
  userPromptText,
  visibleRows,
  type AgentStatus,
  type BuildDeps,
  type Row,
  type SessionData,
  type SessionInfo,
  type SessionMessageInfo,
} from "../src/gui/model.js"

// --- fixtures ----------------------------------------------------------------

const info = (o: Partial<SessionInfo> & { id: string }): SessionInfo =>
  ({
    parentID: o.parentID,
    title: "subagent",
    agent: "build",
    cost: 0,
    tokens: { input: 1, output: 2, reasoning: 0, cache: { read: 3, write: 4 } },
    time: { created: 1_000, updated: 1_000 },
    ...o,
  }) as unknown as SessionInfo

const deps = (o: Partial<BuildDeps> = {}): BuildDeps => ({
  status: () => "idle",
  missing: () => false,
  ...o,
})

const row = (o: Partial<Row> & { id: string }): Row => ({
  depth: 0,
  title: o.id,
  status: "running",
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  cost: 0,
  startedAt: 0,
  missing: false,
  pending: false,
  ...o,
})

type Part = { type: string; text?: string }
const text = (v: string): Part => ({ type: "text", text: v })
const reasoning = (v: string): Part => ({ type: "reasoning", text: v })
const tool = (): Part => ({ type: "tool" })
const assistant = (content: Part[]) => ({ type: "assistant", content }) as unknown as SessionMessageInfo
const user = (v: string) => ({ type: "user", text: v }) as unknown as SessionMessageInfo

const data = (infos: SessionInfo[], o: { running?: string[]; missing?: string[] } = {}): SessionData => {
  const running = new Set(o.running ?? [])
  const missing = new Set(o.missing ?? [])
  return {
    list: () => infos,
    status: (id: string) => (running.has(id) ? "running" : "idle"),
    missing: (id: string) => missing.has(id),
  } as unknown as SessionData
}

/** A `root`-attached chain of sessions, each the parent of the next. */
const chain = (...ids: string[]): SessionInfo[] =>
  ids.map((id, i) =>
    info({ id, parentID: i === 0 ? "root" : ids[i - 1], time: { created: 100 - i, updated: 100 - i } }),
  )

// --- formatters ----------------------------------------------------------------

describe("formatters", () => {
  it.each<[number, string]>([
    [0, "0"], [-42, "0"], [Number.NaN, "0"], [Number.POSITIVE_INFINITY, "0"],
    [999, "999"], [999.4, "999"], [999.6, "1k"], [1000, "1k"], [1500, "1.5k"], [999_949, "999.9k"], [999_949.6, "1M"], [1_000_000, "1M"], [1999, "2k"],
  ])("formatTokens(%s) is %s", (n, expected) => expect(formatTokens(n)).toBe(expected))
  it.each<[number, string]>([
    [0, "$0"], [-1, "$0"], [Number.NaN, "$0"], [Number.NEGATIVE_INFINITY, "$0"],
    [0.004, "<$0.01"], [0.01, "$0.01"], [1.239, "$1.24"],
  ])("formatCost(%s) is %s", (n, expected) => expect(formatCost(n)).toBe(expected))
  it.each<[number, string]>([
    [0, "0s"], [999, "0s"], [Number.NaN, "0s"], [Number.POSITIVE_INFINITY, "0s"],
    [1500, "1s"], [59_000, "59s"], [60_000, "1m"], [3_600_000, "1h00m"], [7_500_000, "2h05m"],
  ])("formatElapsed(%s) is %s", (n, expected) => expect(formatElapsed(n)).toBe(expected))
})

// --- sortRows ------------------------------------------------------------------

type Sortable = { id: string; status: AgentStatus; startedAt: number }

describe("sortRows", () => {
  const rows: Sortable[] = [
    { id: "old-done", status: "succeeded", startedAt: 100 },
    { id: "new-running", status: "running", startedAt: 50 },
    { id: "newer-done", status: "failed", startedAt: 300 },
    { id: "older-running", status: "running", startedAt: 10 },
  ]

  it("puts running rows before finished ones, then newest startedAt first, without mutating input", () => {
    const ids = rows.map((r) => r.id)
    expect(sortRows(rows).map((r) => r.id)).toEqual(["new-running", "older-running", "newer-done", "old-done"])
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it("keeps input order for equal startedAt (the comparator returns 0)", () => {
    const tied: Sortable[] = [
      { id: "first", status: "running", startedAt: 200 },
      { id: "second", status: "running", startedAt: 200 },
      { id: "third", status: "idle", startedAt: 200 },
    ]
    expect(sortRows(tied).map((r) => r.id)).toEqual(["first", "second", "third"])
  })
})

// --- buildTree -----------------------------------------------------------------

describe("buildTree", () => {
  it("nests descendants under parentID, depth 0 for direct children, and keeps input order", () => {
    const infos = [
      info({ id: "root" }),
      info({ id: "a", parentID: "root", time: { created: 100, updated: 100 } }),
      info({ id: "b", parentID: "root", time: { created: 200, updated: 200 } }),
      info({ id: "a1", parentID: "a", time: { created: 50, updated: 50 } }),
    ]
    const original = infos.map((i) => i.id)
    const rows = buildTree(infos, "root", deps())
    expect(rows.map((r) => r.id)).toEqual(["b", "a", "a1"])
    expect(rows.map((r) => r.depth)).toEqual([0, 0, 1])
    expect(rows.map((r) => r.parentID)).toEqual(["root", "root", "a"])
    expect(infos.map((i) => i.id)).toEqual(original)
  })

  it("shows a session once when it is listed twice or is its own ancestor", () => {
    const duplicated = buildTree(
      [info({ id: "root" }), info({ id: "a", parentID: "root" }), info({ id: "a", parentID: "root" })],
      "root",
      deps(),
    )
    const cyclic = buildTree(
      [info({ id: "root" }), info({ id: "a", parentID: "root" }), info({ id: "b", parentID: "a" }), info({ id: "a", parentID: "b" })],
      "root",
      deps(),
    )
    expect(duplicated.map((r) => r.id)).toEqual(["a"])
    expect(cyclic.map((r) => r.id)).toEqual(["a", "b"])
  })

  it("adds one ellipsis row after a depth-3 row that has children", () => {
    const infos = [info({ id: "root" }), ...chain("d1", "d2", "d3", "d4"), info({ id: "d5", parentID: "d4" })]
    const rows = buildTree(infos, "root", deps())
    expect(rows.map((r) => r.id)).toEqual(["d1", "d2", "d3", "d4", "d4:ellipsis"])
    expect(rows[4]).toMatchObject({ id: "d4:ellipsis", parentID: "d4", depth: 4, ellipsis: true, missing: true, pending: false, title: "…" })
  })

  it("adds no ellipsis after a depth-3 row without children", () => {
    const rows = buildTree([info({ id: "root" }), ...chain("e1", "e2", "e3")], "root", deps())
    expect(rows.map((r) => r.id)).toEqual(["e1", "e2", "e3"])
    expect(rows.every((r) => r.ellipsis !== true)).toBe(true)
  })

  it("never lists the root itself nor sessions outside its subtree", () => {
    const infos = [
      info({ id: "root", title: "Root" }),
      info({ id: "other-root" }),
      info({ id: "orphan", parentID: "not-listed" }),
      info({ id: "child", parentID: "root" }),
    ]
    expect(buildTree(infos, "root", deps()).map((r) => r.id)).toEqual(["child"])
  })

  it("lets deps.status running override the stored outcome, otherwise outcome wins", () => {
    const infos = [
      info({ id: "root" }),
      info({ id: "run", parentID: "root", outcome: "failed" }),
      info({ id: "done", parentID: "root", outcome: "succeeded" }),
      info({ id: "fresh", parentID: "root" }),
    ]
    const rows = buildTree(infos, "root", deps({ status: (id) => (id === "run" ? "running" : "idle") }))
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId.run.status).toBe("running")
    expect(byId.run.outcome).toBe("failed")
    expect(byId.done.status).toBe("succeeded")
    expect(byId.fresh.status).toBe("idle")
  })

  it("falls back from a blank title to the agent, then to the id", () => {
    const infos = [
      info({ id: "root" }),
      info({ id: "named", parentID: "root", title: "  ", agent: "oracle" }),
      info({ id: "anon", parentID: "root", title: "   ", agent: undefined }),
      info({ id: "trimmed", parentID: "root", title: "  Named  " }),
    ]
    const byId = Object.fromEntries(buildTree(infos, "root", deps()).map((r) => [r.id, r]))
    expect(byId.named.title).toBe("oracle")
    expect(byId.anon.title).toBe("anon")
    expect(byId.trimmed.title).toBe("Named")
  })

  it("maps tokens, cost and times from the session info", () => {
    const [entry] = buildTree(
      [
        info({ id: "root" }),
        info({
          id: "a",
          parentID: "root",
          tokens: { input: 11, output: 22, reasoning: 99, cache: { read: 33, write: 44 } },
          cost: 1.25,
          time: { created: 123, updated: 999, idle: 456, busy: 400 },
        }),
      ],
      "root",
      deps(),
    )
    expect(entry.tokens).toEqual({ input: 11, output: 22, cacheRead: 33, cacheWrite: 44 })
    expect(entry.cost).toBe(1.25)
    expect(entry.startedAt).toBe(123)
    expect(entry.endedAt).toBe(456)
    expect(entry.busyAt).toBe(400)
  })
})

// --- mergeBackground -----------------------------------------------------------

describe("mergeBackground", () => {
  it("merges only subagent tasks", () => {
    const merged = mergeBackground([], [
      { id: "task", type: "task", label: "Not an agent" },
      { id: "bg", type: "subagent", label: "Agent" },
    ])
    expect(merged.map((r) => r.id)).toEqual(["bg"])
  })

  it("skips tasks whose id is already in the rows", () => {
    const existing = row({ id: "a" })
    const merged = mergeBackground([existing], [
      { id: "a", type: "subagent", label: "Duplicate" },
      { id: "b", type: "subagent", label: "New" },
    ])
    expect(merged.map((r) => r.id)).toEqual(["b", "a"])
    expect(merged[1]).toBe(existing)
  })

  it("puts pending rows first, in task order, with running placeholder fields", () => {
    const store = row({ id: "store" })
    const merged = mergeBackground([store], [
      { id: "p1", type: "subagent", label: "First" },
      { id: "p2", type: "subagent", label: "", agent: "oracle" },
      { id: "p3", type: "subagent", label: "" },
    ])
    expect(merged.map((r) => r.id)).toEqual(["p1", "p2", "p3", "store"])
    expect(merged.slice(0, 3).map((r) => r.title)).toEqual(["First", "oracle", "p3"])
    for (const pending of merged.slice(0, 3)) {
      expect(pending).toMatchObject({
        pending: true,
        status: "running",
        depth: 0,
        cost: 0,
        startedAt: 0,
        missing: false,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      })
      expect(pending.ellipsis).toBeUndefined()
    }
    expect(store.pending).toBe(false)
  })
})

// --- visibleRows ---------------------------------------------------------------

describe("visibleRows", () => {
  it("combines the store tree with background tasks, without duplicating known ids", () => {
    const infos = [
      info({ id: "root" }),
      info({ id: "a", parentID: "root", title: "Alpha", time: { created: 100, updated: 100 } }),
      info({ id: "b", parentID: "root", title: "Beta", time: { created: 200, updated: 200 } }),
    ]
    const session = {
      id: "root",
      background: [
        { id: "a", type: "subagent", label: "Already in the store" },
        { id: "p", type: "subagent", label: "Pending" },
        { id: "x", type: "task", label: "Not a subagent" },
      ],
    }
    const rows = visibleRows(data(infos, { running: ["a"], missing: ["a"] }), session)
    const a = rows.filter((r) => r.id === "a")
    // `a` runs, so buildTree sorts it before idle `b`; pending `p` always comes first.
    expect(rows.map((r) => r.id)).toEqual(["p", "a", "b"])
    expect(rows[0]).toMatchObject({ pending: true, status: "running" })
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ title: "Alpha", status: "running", missing: true })
    expect(rows.some((r) => r.id === "x")).toBe(false)
  })
})

// --- message helpers -----------------------------------------------------------

describe("lastAssistantText", () => {
  it("returns the text of the last assistant message", () => {
    const messages = [user("hello"), assistant([text("first")]), assistant([text("second")])]
    expect(lastAssistantText(messages)).toBe("second")
  })

  it("joins text parts with a blank line, skips reasoning, and trims the edges", () => {
    const messages = [assistant([text("  first  "), reasoning("hidden"), text("second")])]
    expect(lastAssistantText(messages)).toBe("first  \n\nsecond")
  })

  it("falls back to an earlier assistant message when the last one has no text parts", () => {
    const messages = [assistant([text("keep")]), assistant([reasoning("thinking"), tool()])]
    expect(lastAssistantText(messages)).toBe("keep")
  })

  it("returns undefined when no assistant message has text", () => {
    expect(lastAssistantText([user("hello"), assistant([reasoning("only thinking"), tool()])])).toBeUndefined()
  })
})

describe("reasoningBlocks", () => {
  it("collects only assistant reasoning parts, in order, trimmed and without empties", () => {
    const messages = [
      user("prompt"),
      assistant([reasoning("  think one  "), text("answer"), reasoning("think two")]),
      user("steer"),
      assistant([reasoning("   "), reasoning("think three"), text("done")]),
    ]
    expect(reasoningBlocks(messages)).toEqual(["think one", "think two", "think three"])
  })

  it("re-reads a streaming part's text on every call instead of caching it by identity", () => {
    // Regression guard: an identity-keyed cache (e.g. a WeakMap) goes stale because the store mutates a part in place
    // while it streams, so the same array and part object must yield the updated text.
    const part = reasoning("first chunk")
    const messages = [assistant([part])]
    expect(reasoningBlocks(messages)).toEqual(["first chunk"])
    part.text = "first chunk and more"
    expect(reasoningBlocks(messages)).toEqual(["first chunk and more"])
  })
})

describe("userPromptText", () => {
  it("returns the first non-blank user text, ignoring later steering and blank messages", () => {
    expect(userPromptText([user("  "), user("  real prompt  "), user("steer later")])).toBe("real prompt")
  })

  it("returns undefined when no user message has text", () => {
    expect(userPromptText([user("   "), assistant([text("answer")])])).toBeUndefined()
  })
})
