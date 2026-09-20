import { describe, expect, it } from 'vitest'
import {
  filterSlashCommands,
  matchInputRule,
  SLASH_COMMANDS
} from '../src/renderer/src/editor/commands'
import { parseBlockContent, parseContent, serializeContent } from '../src/renderer/src/editor/content'

describe('matchInputRule', () => {
  it('reconoce encabezados con 1 a 3 almohadillas seguidas de espacio', () => {
    expect(matchInputRule('# ')).toEqual({ type: 'heading', text: '' })
    expect(matchInputRule('## ')).toEqual({ type: 'heading', text: '' })
    expect(matchInputRule('### Título')).toEqual({ type: 'heading', text: 'Título' })
  })

  it('reconoce listas con - , * y +', () => {
    expect(matchInputRule('- ')).toEqual({ type: 'bullet', text: '' })
    expect(matchInputRule('* item')).toEqual({ type: 'bullet', text: 'item' })
    expect(matchInputRule('+ item')).toEqual({ type: 'bullet', text: 'item' })
  })

  it('reconoce tareas con [] y [ ]', () => {
    expect(matchInputRule('[] ')).toEqual({ type: 'todo', text: '' })
    expect(matchInputRule('[ ] comprar')).toEqual({ type: 'todo', text: 'comprar' })
  })

  it('reconoce citas y código', () => {
    expect(matchInputRule('> cita')).toEqual({ type: 'quote', text: 'cita' })
    expect(matchInputRule('```')).toEqual({ type: 'code', text: '' })
  })

  it('reconoce divisores exactos ---, *** y ___', () => {
    expect(matchInputRule('---')).toEqual({ type: 'divider', text: '' })
    expect(matchInputRule('***')).toEqual({ type: 'divider', text: '' })
    expect(matchInputRule('___')).toEqual({ type: 'divider', text: '' })
    expect(matchInputRule('---x')).toBeNull()
  })

  it('no dispara sin el espacio ni a mitad de texto', () => {
    expect(matchInputRule('#')).toBeNull()
    expect(matchInputRule('-')).toBeNull()
    expect(matchInputRule('hola # ')).toBeNull()
    expect(matchInputRule('texto normal')).toBeNull()
    expect(matchInputRule('')).toBeNull()
  })
})

describe('filterSlashCommands', () => {
  it('sin query devuelve todos los comandos', () => {
    expect(filterSlashCommands('')).toHaveLength(SLASH_COMMANDS.length)
    expect(filterSlashCommands('   ')).toHaveLength(SLASH_COMMANDS.length)
  })

  it('filtra por etiqueta, tipo y palabras clave', () => {
    expect(filterSlashCommands('cita').map((command) => command.type)).toEqual(['quote'])
    expect(filterSlashCommands('tarea').map((command) => command.type)).toEqual(['todo'])
    expect(filterSlashCommands('h1').map((command) => command.type)).toEqual(['heading'])
    expect(filterSlashCommands('bullet').map((command) => command.type)).toEqual(['bullet'])
    expect(filterSlashCommands('divisor').map((command) => command.type)).toEqual(['divider'])
  })

  it('ignora mayúsculas y espacios', () => {
    expect(filterSlashCommands('  TITULO ').map((command) => command.type)).toEqual(['heading'])
  })

  it('devuelve vacío si nada coincide', () => {
    expect(filterSlashCommands('zzzz')).toEqual([])
  })
})

describe('content con checked', () => {
  it('serializa solo el texto cuando la tarea no está marcada', () => {
    expect(serializeContent('hola')).toBe('{"text":"hola"}')
    expect(serializeContent('hola', false)).toBe('{"text":"hola"}')
  })

  it('serializa checked true y lo vuelve a parsear', () => {
    const raw = serializeContent('tarea', true)
    expect(raw).toBe('{"text":"tarea","checked":true}')
    expect(parseBlockContent(raw)).toEqual({ text: 'tarea', checked: true })
  })

  it('mantiene compatibilidad con contenido antiguo y corrupto', () => {
    expect(parseBlockContent('{"text":"viejo"}')).toEqual({ text: 'viejo', checked: false })
    expect(parseContent('{"text":"viejo"}')).toBe('viejo')
    expect(parseBlockContent('no-json')).toEqual({ text: '', checked: false })
    expect(parseBlockContent('{"checked":true}')).toEqual({ text: '', checked: false })
    expect(parseBlockContent('{"text":1}')).toEqual({ text: '', checked: false })
  })
})
