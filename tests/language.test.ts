import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LANGUAGE_PREFERENCE_KEY,
  parseLanguagePreference
} from '../src/shared/language'
import { setLocale } from '../src/renderer/src/i18n'
import { en } from '../src/renderer/src/i18n/locales/en'
import { es } from '../src/renderer/src/i18n/locales/es'
import { useLocaleStore } from '../src/renderer/src/store/localeStore'

function keysOf(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix]
  if (Array.isArray(node)) return [prefix]
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      keysOf(value, prefix ? `${prefix}.${key}` : key)
    )
  }
  return [prefix]
}

describe('parseLanguagePreference', () => {
  it('acepta en y es, y cae a en con valores inválidos', () => {
    expect(parseLanguagePreference('en')).toBe('en')
    expect(parseLanguagePreference('es')).toBe('es')
    expect(parseLanguagePreference(null)).toBe('en')
    expect(parseLanguagePreference(undefined)).toBe('en')
    expect(parseLanguagePreference('fr')).toBe('en')
    expect(parseLanguagePreference('')).toBe('en')
  })
})

describe('catálogo es', () => {
  it('tiene paridad de claves con en', () => {
    expect(keysOf(es).sort()).toEqual(keysOf(en).sort())
  })
})

describe('localeStore', () => {
  const settings = new Map<string, string>()

  beforeEach(() => {
    settings.clear()
    useLocaleStore.setState({ locale: 'en', initialized: false })
    setLocale('en')
    vi.stubGlobal('window', {
      api: {
        settings: {
          get: vi.fn(async (key: string) => settings.get(key) ?? null),
          set: vi.fn(async (key: string, value: string) => {
            settings.set(key, value)
          })
        }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useLocaleStore.setState({ locale: 'en', initialized: false })
    setLocale('en')
  })

  it('inicializa desde el setting guardado', async () => {
    settings.set(LANGUAGE_PREFERENCE_KEY, 'es')
    await useLocaleStore.getState().initialize()
    expect(useLocaleStore.getState().locale).toBe('es')
  })

  it('cae a en sin setting o con valor inválido', async () => {
    await useLocaleStore.getState().initialize()
    expect(useLocaleStore.getState().locale).toBe('en')

    useLocaleStore.setState({ locale: 'en', initialized: false })
    settings.set(LANGUAGE_PREFERENCE_KEY, 'fr')
    await useLocaleStore.getState().initialize()
    expect(useLocaleStore.getState().locale).toBe('en')
  })

  it('persiste la preferencia al cambiarla', async () => {
    await useLocaleStore.getState().initialize()
    useLocaleStore.getState().setLocalePreference('es')
    expect(useLocaleStore.getState().locale).toBe('es')
    expect(settings.get(LANGUAGE_PREFERENCE_KEY)).toBe('es')
  })
})
