import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '../src/main/db/connection'
import { createSettingsRepo } from '../src/main/db/repositories/settings'
import { parseThemePreference, resolveTheme, THEME_PREFERENCE_KEY } from '../src/shared/theme'

describe('preferencia de tema', () => {
  it('acepta light, dark y system, y cae a system con valores inválidos', () => {
    expect(parseThemePreference('light')).toBe('light')
    expect(parseThemePreference('dark')).toBe('dark')
    expect(parseThemePreference('system')).toBe('system')
    expect(parseThemePreference(null)).toBe('system')
    expect(parseThemePreference(undefined)).toBe('system')
    expect(parseThemePreference('solar')).toBe('system')
  })

  it('resuelve system según el sistema y el resto tal cual', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('settings repo', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('devuelve null para claves desconocidas', () => {
    const settings = createSettingsRepo(db)

    expect(settings.get('theme')).toBeNull()
  })

  it('guarda y actualiza valores por clave', () => {
    const settings = createSettingsRepo(db)

    settings.set(THEME_PREFERENCE_KEY, 'dark')
    expect(settings.get(THEME_PREFERENCE_KEY)).toBe('dark')

    settings.set(THEME_PREFERENCE_KEY, 'light')
    expect(settings.get(THEME_PREFERENCE_KEY)).toBe('light')

    settings.set('otra', 'valor')
    expect(settings.get('otra')).toBe('valor')
    expect(settings.get(THEME_PREFERENCE_KEY)).toBe('light')
  })
})
