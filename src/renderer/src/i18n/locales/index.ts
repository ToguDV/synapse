import { en } from './en'

export type Messages = typeof en

export const CATALOGS = { en } satisfies Record<string, Messages>

export type Locale = keyof typeof CATALOGS

export const DEFAULT_LOCALE: Locale = 'en'
