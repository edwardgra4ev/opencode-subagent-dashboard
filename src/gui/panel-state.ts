export type PanelUiState = {
  activeOnly: boolean
  finishedOpen: boolean | undefined
  expanded: boolean
  openOutput: string | undefined
  scrollTop: number
}

/** The host never drops a deleted session's state, so the cache needs a ceiling to stay bounded. */
const MAX_PANEL_STATES = 100

/** Per-session view state, kept at module level so it survives the host remounting the panel on a tab switch. */
const panelStates = new Map<string, PanelUiState>()

export function panelState(key: string): PanelUiState {
  const found = panelStates.get(key)
  // Map order is insertion order: delete + set on every access leaves the first key as the least recently used.
  if (found) {
    panelStates.delete(key)
    panelStates.set(key, found)
    return found
  }
  const created: PanelUiState = { activeOnly: false, finishedOpen: undefined, expanded: false, openOutput: undefined, scrollTop: 0 }
  panelStates.set(key, created)
  if (panelStates.size > MAX_PANEL_STATES) {
    const oldest = panelStates.keys().next()
    if (!oldest.done) panelStates.delete(oldest.value)
  }
  return created
}

/** Drops a closed panel's view state: the session no longer shows the panel, so nothing will restore it. */
export function forgetPanelState(sessionKey: string) {
  panelStates.delete(sessionKey)
}
