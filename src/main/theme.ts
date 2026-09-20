import { nativeTheme } from 'electron'
import { parseThemePreference, THEME_PREFERENCE_KEY } from '../shared/theme'
import type { SettingsRepo } from './db/repositories/settings'

export function applyStoredTheme(settings: SettingsRepo): void {
  nativeTheme.themeSource = parseThemePreference(settings.get(THEME_PREFERENCE_KEY))
}

export function applyThemePreference(value: string): void {
  nativeTheme.themeSource = parseThemePreference(value)
}
