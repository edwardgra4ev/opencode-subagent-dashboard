import { describe, expect, it } from "vitest"
import { forgetPanelState, panelState, type PanelUiState } from "../src/gui/panel-state.js"

// Isolation: each test uses its own key prefix, and eviction tests insert a full 100-key window, so no module reset is needed.
const keys = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}${i}`)

const defaults: PanelUiState = {
  activeOnly: false,
  finishedOpen: undefined,
  expanded: false,
  openOutput: undefined,
  scrollTop: 0,
}

describe("panelState", () => {
  it("starts a key with the documented defaults", () => {
    expect(panelState("defaults:a")).toEqual(defaults)
  })

  it("returns the same object for a key and keeps mutations across calls", () => {
    const first = panelState("same:a")
    first.activeOnly = true
    first.scrollTop = 120

    const again = panelState("same:a")

    expect(again).toBe(first)
    expect(again.activeOnly).toBe(true)
    expect(again.scrollTop).toBe(120)
  })

  it("keeps different keys independent", () => {
    const a = panelState("distinct:a")
    const b = panelState("distinct:b")
    a.activeOnly = true
    a.scrollTop = 5
    b.expanded = true

    expect(panelState("distinct:a")).toMatchObject({ activeOnly: true, scrollTop: 5, expanded: false })
    expect(panelState("distinct:b")).toMatchObject({ activeOnly: false, scrollTop: 0, expanded: true })
  })

  it("forgets a key so the next lookup returns a fresh default object", () => {
    const first = panelState("forget:a")
    first.scrollTop = 9

    forgetPanelState("forget:a")
    const second = panelState("forget:a")

    expect(second).not.toBe(first)
    expect(second).toEqual(defaults)
  })

  it("evicts the least recently used key when a 101st one is added", () => {
    const all = keys("evict:", 100)
    const handles = new Map<string, PanelUiState>()
    for (const [i, key] of all.entries()) {
      const state = panelState(key)
      state.scrollTop = i + 1
      handles.set(key, state)
    }
    // Iterating in insertion order touches every key and leaves the LRU order unchanged.
    for (const [i, key] of all.entries()) expect(panelState(key).scrollTop).toBe(i + 1)

    const added = panelState("evict:extra")
    added.scrollTop = 777

    expect(panelState(all[1]).scrollTop).toBe(2)
    expect(panelState("evict:extra")).toBe(added)
    expect(panelState("evict:extra").scrollTop).toBe(777)
    // Read the evicted key last: recreating it evicts the next oldest.
    const revived = panelState(all[0])
    expect(revived).not.toBe(handles.get(all[0]))
    expect(revived).toEqual(defaults)
  })

  it("touching a key through panelState protects it from eviction", () => {
    const a = panelState("touch:a")
    a.scrollTop = 5
    for (const [i, key] of keys("touch:b", 99).entries()) panelState(key).scrollTop = i + 1

    expect(panelState("touch:a")).toBe(a)
    panelState("touch:c")
    panelState("touch:c").scrollTop = 42

    expect(panelState("touch:a")).toBe(a)
    expect(panelState("touch:a").scrollTop).toBe(5)
    expect(panelState("touch:c").scrollTop).toBe(42)
    expect(panelState("touch:b1").scrollTop).toBe(2)
    // b0 is the second-oldest and was evicted; read it last so its recreation cannot disturb earlier assertions.
    expect(panelState("touch:b0")).toEqual(defaults)
  })

  it("keeps exactly 100 entries live, evicting only on the 101st insert", () => {
    const all = keys("boundary:", 100)
    const handles = new Map<string, PanelUiState>()
    for (const [i, key] of all.entries()) {
      const state = panelState(key)
      state.scrollTop = i + 1
      handles.set(key, state)
    }

    // Exactly 100 entries still hold their identity and state: no eviction at the limit.
    for (const [i, key] of all.entries()) {
      const state = panelState(key)
      expect(state).toBe(handles.get(key))
      expect(state.scrollTop).toBe(i + 1)
    }
    const extra = panelState("boundary:extra")
    expect(extra).toEqual(defaults)

    // The 101st insert drops exactly one entry: all but the oldest survive.
    for (const [i, key] of all.slice(1).entries()) {
      const state = panelState(key)
      expect(state).toBe(handles.get(key))
      expect(state.scrollTop).toBe(i + 2)
    }
    const revived = panelState(all[0])
    expect(revived).not.toBe(handles.get(all[0]))
    expect(revived).toEqual(defaults)
  })
})

describe("forgetPanelState", () => {
  it("does not throw for a key that was never stored", () => {
    expect(() => forgetPanelState("forget:never")).not.toThrow()
  })
})
