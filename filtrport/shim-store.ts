// Store shim — replaces filtr's zustand store for the Atelier port. The
// renderer reads settings through this exact interface; filtr.js drives it.
import type { Settings } from '@filtr/state/types'

let current: Settings | null = null
let dirtyCount = 0

export const useStore = {
  getState() {
    return { settings: current as Settings, dirty: dirtyCount }
  },
}

export function setSettings(s: Settings) {
  current = s
  dirtyCount++
}

export function getSettings(): Settings | null {
  return current
}

export function bumpDirty() {
  dirtyCount++
}
