export const LANGUAGE_PREFERENCE_KEY = 'language'

export const LANGUAGES = ['en', 'es'] as const

export type LanguagePreference = (typeof LANGUAGES)[number]

export function parseLanguagePreference(value: string | null | undefined): LanguagePreference {
  return LANGUAGES.includes(value as LanguagePreference)
    ? (value as LanguagePreference)
    : 'en'
}
