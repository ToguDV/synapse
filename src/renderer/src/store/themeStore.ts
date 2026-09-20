import { create } from 'zustand'
import {
  parseThemePreference,
  resolveTheme,
  THEME_PREFERENCE_KEY,
  type ResolvedTheme,
  type ThemePreference
} from '../../../shared/theme'

export const THEME_CYCLE: ThemePreference[] = ['light', 'dark', 'system']

export const THEME_LABELS: Record<ThemePreference, { icon: string; label: string }> = {
  light: { icon: '☀', label: 'Claro' },
  dark: { icon: '🌙', label: 'Oscuro' },
  system: { icon: '🖥', label: 'Sistema' }
}

interface ThemeState {
  preference: ThemePreference
  resolved: ResolvedTheme
  initialized: boolean
  initialize: () => Promise<void>
  setPreference: (preference: ThemePreference) => void
  cyclePreference: () => void
}

const darkQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

function systemDark(): boolean {
  return darkQuery?.matches ?? false
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.theme = resolved
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: 'system',
  resolved: resolveTheme('system', systemDark()),
  initialized: false,

  initialize: async () => {
    if (get().initialized) return
    let stored: string | null = null
    try {
      stored = await window.api.settings.get(THEME_PREFERENCE_KEY)
    } catch {
      stored = null
    }
    const preference = parseThemePreference(stored)
    const resolved = resolveTheme(preference, systemDark())
    applyResolvedTheme(resolved)
    set({ preference, resolved, initialized: true })
  },

  setPreference: (preference) => {
    const resolved = resolveTheme(preference, systemDark())
    applyResolvedTheme(resolved)
    set({ preference, resolved })
    void window.api.settings.set(THEME_PREFERENCE_KEY, preference).catch(() => undefined)
  },

  cyclePreference: () => {
    const current = get().preference
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length]
    get().setPreference(next)
  }
}))

if (darkQuery) {
  darkQuery.addEventListener('change', () => {
    const { preference, resolved } = useThemeStore.getState()
    if (preference !== 'system') return
    const next = resolveTheme('system', systemDark())
    if (next === resolved) return
    applyResolvedTheme(next)
    useThemeStore.setState({ resolved: next })
  })
}

applyResolvedTheme(useThemeStore.getState().resolved)
