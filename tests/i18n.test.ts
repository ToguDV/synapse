import { afterEach, describe, expect, it } from 'vitest'
import { BLOCK_MENU_ORDER } from '../src/renderer/src/editor/registry'
import { getLocale, setLocale, t, tList, type MessageKey } from '../src/renderer/src/i18n'
import { CATALOGS } from '../src/renderer/src/i18n/locales'

afterEach(() => {
  setLocale('en')
})

describe('i18n', () => {
  it('resuelve claves anidadas en el idioma por defecto', () => {
    expect(getLocale()).toBe('en')
    expect(t('common.untitled')).toBe('Untitled')
    expect(t('sidebar.newPage')).toBe('New page')
    expect(t('theme.light')).toBe('Light')
  })

  it('interpola parámetros', () => {
    expect(t('sidebar.deleteConfirmTitle', { title: 'Trip' })).toBe('Delete “Trip”?')
    expect(t('search.empty', { term: 'abc' })).toBe('No results for “abc”')
    expect(t('theme.current', { theme: 'Dark' })).toBe('Theme: Dark')
  })

  it('deja intactos los placeholders sin valor', () => {
    expect(t('sidebar.deleteConfirmTitle')).toBe('Delete “{{title}}”?')
  })

  it('resuelve plurales con Intl.PluralRules', () => {
    expect(t('sidebar.deleteWithChildren', { count: 1 })).toContain('1 subpage and')
    expect(t('sidebar.deleteWithChildren', { count: 3 })).toContain('3 subpages and')
  })

  it('devuelve la clave cuando no existe', () => {
    expect(t('missing.key' as MessageKey)).toBe('missing.key')
  })

  it('expone listas de palabras clave', () => {
    expect(tList('blocks.paragraph.keywords')).toContain('text')
    expect(tList('blocks.divider.keywords')).toContain('divider')
  })

  it('cubre las etiquetas de todos los tipos de bloque', () => {
    for (const type of BLOCK_MENU_ORDER) {
      expect(t(`blocks.${type}.label`)).not.toBe('')
      expect(t(`blocks.${type}.description`)).not.toBe('')
      expect(tList(`blocks.${type}.keywords`).length).toBeGreaterThan(0)
    }
    expect(t('blocks.divider.placeholder')).toBe('')
  })

  it('registra inglés y español con paridad de claves', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual(['en', 'es'])
    expect(t('language.ariaLabel')).toBe('Language')
  })

  it('resuelve el catálogo español al cambiar el locale', () => {
    setLocale('es')
    expect(getLocale()).toBe('es')
    expect(t('common.untitled')).toBe('Sin título')
    expect(t('sidebar.newPage')).toBe('Nueva página')
    expect(t('theme.light')).toBe('Claro')
    expect(t('language.ariaLabel')).toBe('Idioma')
    expect(t('sidebar.deleteConfirmTitle', { title: 'Viaje' })).toBe('¿Eliminar “Viaje”?')
    expect(t('search.empty', { term: 'abc' })).toBe('Sin resultados para “abc”')
    setLocale('en')
    expect(t('common.untitled')).toBe('Untitled')
  })

  it('aplica plurales españoles y keywords por idioma', () => {
    setLocale('es')
    expect(t('sidebar.deleteWithChildren', { count: 1 })).toContain('1 subpágina')
    expect(t('sidebar.deleteWithChildren', { count: 3 })).toContain('3 subpáginas')
    expect(tList('blocks.quote.keywords')).toContain('cita')
    expect(tList('blocks.paragraph.keywords')).not.toContain('text')
  })
})
