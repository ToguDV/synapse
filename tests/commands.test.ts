import { describe, expect, it } from 'vitest'
import {
  buildSlashCommands,
  filterSlashCommands,
  matchInputRule
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
    const commands = buildSlashCommands()
    expect(filterSlashCommands('', commands)).toHaveLength(commands.length)
    expect(filterSlashCommands('   ', commands)).toHaveLength(commands.length)
  })

  it('filtra por etiqueta, tipo y palabras clave', () => {
    const commands = buildSlashCommands()
    expect(filterSlashCommands('quote', commands).map((command) => command.type)).toEqual(['quote'])
    expect(filterSlashCommands('task', commands).map((command) => command.type)).toEqual(['todo'])
    expect(filterSlashCommands('h1', commands).map((command) => command.type)).toEqual(['heading'])
    expect(filterSlashCommands('bullet', commands).map((command) => command.type)).toEqual(['bullet'])
    expect(filterSlashCommands('divider', commands).map((command) => command.type)).toEqual([
      'divider'
    ])
  })

  it('ignora mayúsculas y espacios', () => {
    expect(
      filterSlashCommands('  HEADING ', buildSlashCommands()).map((command) => command.type)
    ).toEqual(['heading'])
  })

  it('devuelve vacío si nada coincide', () => {
    expect(filterSlashCommands('zzzz', buildSlashCommands())).toEqual([])
  })
})

describe('content con status', () => {
  it('serializa solo el texto cuando el estado es todo', () => {
    expect(serializeContent('hola')).toBe('{"text":"hola"}')
    expect(serializeContent('hola', 'todo')).toBe('{"text":"hola"}')
  })

  it('serializa estados no por defecto y los vuelve a parsear', () => {
    const raw = serializeContent('tarea', 'done')
    expect(raw).toBe('{"text":"tarea","status":"done"}')
    expect(parseBlockContent(raw)).toEqual({ text: 'tarea', status: 'done' })
    expect(parseBlockContent(serializeContent('t', 'in-progress'))).toEqual({
      text: 't',
      status: 'in-progress'
    })
  })

  it('traduce el contenido antiguo con checked al estado equivalente', () => {
    expect(parseBlockContent('{"text":"viejo"}')).toEqual({ text: 'viejo', status: 'todo' })
    expect(parseBlockContent('{"text":"viejo","checked":true}')).toEqual({
      text: 'viejo',
      status: 'done'
    })
    expect(parseBlockContent('{"text":"viejo","checked":false}')).toEqual({
      text: 'viejo',
      status: 'todo'
    })
  })

  it('mantiene compatibilidad con contenido corrupto o inválido', () => {
    expect(parseContent('{"text":"viejo"}')).toBe('viejo')
    expect(parseBlockContent('no-json')).toEqual({ text: '', status: 'todo' })
    expect(parseBlockContent('{"checked":true}')).toEqual({ text: '', status: 'todo' })
    expect(parseBlockContent('{"text":1}')).toEqual({ text: '', status: 'todo' })
    expect(parseBlockContent('{"text":"x","status":"nope"}')).toEqual({ text: 'x', status: 'todo' })
  })
})
