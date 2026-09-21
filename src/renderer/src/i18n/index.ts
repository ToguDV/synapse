import { useSyncExternalStore } from 'react'
import { CATALOGS, DEFAULT_LOCALE, type Locale, type Messages } from './locales'

export interface Plural {
  one: string
  other: string
}

type StringKey<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends Plural
      ? K
      : T[K] extends readonly unknown[]
        ? never
        : T[K] extends object
          ? `${K}.${StringKey<T[K]>}`
          : never
}[keyof T & string]

type ListKey<T> = {
  [K in keyof T & string]: T[K] extends readonly unknown[]
    ? K
    : T[K] extends string | Plural
      ? never
      : T[K] extends object
        ? `${K}.${ListKey<T[K]>}`
        : never
}[keyof T & string]

export type MessageKey = StringKey<Messages>
export type MessageListKey = ListKey<Messages>
export type MessageParams = Record<string, string | number>

let currentLocale: Locale = DEFAULT_LOCALE
const listeners = new Set<() => void>()
const pluralRules = new Map<string, Intl.PluralRules>()

function rulesFor(locale: Locale): Intl.PluralRules {
  let rules = pluralRules.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(locale)
    pluralRules.set(locale, rules)
  }
  return rules
}

function isPlural(value: unknown): value is Plural {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.one === 'string' && typeof candidate.other === 'string'
}

function lookup(catalog: Messages, key: string): unknown {
  let node: unknown = catalog
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

function resolve(key: string): unknown {
  return lookup(CATALOGS[currentLocale], key) ?? lookup(CATALOGS[DEFAULT_LOCALE], key)
}

function interpolate(text: string, params?: MessageParams): string {
  if (!params) return text
  return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

export function t(key: MessageKey, params?: MessageParams): string {
  const value = resolve(key)
  if (typeof value === 'string') return interpolate(value, params)
  if (isPlural(value)) {
    const count = params?.count
    if (typeof count === 'number') {
      const category = rulesFor(currentLocale).select(count)
      return interpolate(value[category as keyof Plural] ?? value.other, params)
    }
    return interpolate(value.other, params)
  }
  return key
}

export function tList(key: MessageListKey): readonly string[] {
  const value = resolve(key)
  return Array.isArray(value) ? (value as readonly string[]) : []
}

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(next: Locale): void {
  if (next === currentLocale) return
  currentLocale = next
  if (typeof document !== 'undefined') document.documentElement.lang = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useTranslation(): {
  t: typeof t
  tList: typeof tList
  locale: Locale
} {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale)
  return { t, tList, locale }
}
