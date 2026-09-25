import { en } from './en'
import { es } from './es'

export type Messages = typeof en

export const CATALOGS = { en, es } satisfies Record<string, Messages>

export type Locale = keyof typeof CATALOGS

export const DEFAULT_LOCALE: Locale = 'en'
