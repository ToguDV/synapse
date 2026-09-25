import { create } from 'zustand'
import {
  LANGUAGE_PREFERENCE_KEY,
  parseLanguagePreference,
  type LanguagePreference
} from '../../../shared/language'
import { setLocale } from '../i18n'

interface LocaleState {
  locale: LanguagePreference
  initialized: boolean
  initialize: () => Promise<void>
  setLocalePreference: (locale: LanguagePreference) => void
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: 'en',
  initialized: false,

  initialize: async () => {
    if (get().initialized) return
    let stored: string | null = null
    try {
      stored = await window.api.settings.get(LANGUAGE_PREFERENCE_KEY)
    } catch {
      stored = null
    }
    const locale = parseLanguagePreference(stored)
    setLocale(locale)
    set({ locale, initialized: true })
  },

  setLocalePreference: (locale) => {
    setLocale(locale)
    set({ locale })
    void window.api.settings.set(LANGUAGE_PREFERENCE_KEY, locale).catch(() => undefined)
  }
}))
