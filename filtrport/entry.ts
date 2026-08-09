// FiltrEngine — the Atelier port of tools/filtr's WebGL2 engine, bundled to
// minidapp/filtr-engine.js by filtrport/build.sh (esbuild, iife, global
// `FiltrEngine`). filtr.js drives it; nothing else touches WebGL.
import type { Settings } from '@filtr/state/types'
import { DEFAULT_SETTINGS } from '@filtr/state/defaults'
import { BUILTIN_PRESETS } from '@filtr/state/presets'
import { PALETTES, paletteById } from '@filtr/engine/palettes'
import { CHARSETS, resolveChars } from '@filtr/engine/charsets'
import { hexToVec3, GLError } from '@filtr/engine/gl'
import { Renderer } from './renderer'
import { setSettings, getSettings, bumpDirty } from './shim-store'

export {
  Renderer,
  DEFAULT_SETTINGS,
  BUILTIN_PRESETS,
  PALETTES,
  paletteById,
  CHARSETS,
  resolveChars,
  hexToVec3,
  GLError,
  setSettings,
  getSettings,
  bumpDirty,
}

/** The global grade every effect now receives (settings.adjust). */
export const ADJUST_DEFAULTS = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  gamma: 1,
  sharpness: 0,
  blur: 0,
  edge: 0,
  quantize: 0,
}

/** Fresh full settings tree for the FILTR tab: filtr defaults + the global
 *  adjust group + 'none' (edit-only) as the starting effect. */
export function freshSettings(): Settings {
  const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings
  ;(s as any).active = 'none'
  ;(s as any).adjust = { ...ADJUST_DEFAULTS }
  return s
}

/** Apply a preset: deterministic patch over DEFAULTS (filtr's model), with
 *  the current adjust/output groups preserved. */
export function applyPreset(presetId: string, current: Settings): Settings {
  const p = BUILTIN_PRESETS.find((x) => x.id === presetId)
  const s = freshSettings() as any
  s.adjust = { ...(current as any).adjust }
  s.output = JSON.parse(JSON.stringify((current as any).output))
  if (p) deepMerge(s, p.settings as any)
  return s as Settings
}

function deepMerge(dst: any, src: any) {
  for (const k in src) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {}
      deepMerge(dst[k], src[k])
    } else {
      dst[k] = src[k]
    }
  }
}

export function supported(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch (e) {
    return false
  }
}
