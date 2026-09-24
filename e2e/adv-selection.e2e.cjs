// Suite adversarial específica del fix de reemplazo de selección (Fase 4, Synapse).
// Solo crea este archivo de test: no modifica código de producción.
//
// Cubre bordes nuevos del fix de `insertPlainText`/Enter-con-selección:
//   J · selección que cruza varias líneas de un mismo bloque
//   K · selección invertida (derecha→izquierda / abajo→arriba)
//   L · pegar multilínea sobre selección + undo/redo
//   M · Backspace/Delete con selección (camino nativo) + undo
//   N · límites de container (elemento vs nodo de texto) en offsetAt
//   O · selección que cruza bloques (ratón y programática)
//
// Uso: node e2e/adv-selection.e2e.cjs
const { chromium } = require('./playwright.cjs')
const path = require('node:path')
const fs = require('node:fs')

const URL = 'http://localhost:5174/'
const MOCK = path.join(__dirname, 'mock-api.js')
const OUT = path.join(require('node:os').tmpdir(), 'opencode')
const AUTOSAVE_MS = 750
fs.mkdirSync(OUT, { recursive: true })

const consoleErrors = []
const report = { stages: [], consoleErrors }

const check = (steps, name, ok, detail) => steps.push({ name, ok: !!ok, detail })
const note = (steps, name, detail) => steps.push({ name, ok: true, note: detail })
const settle = (page, ms = 150) => page.waitForTimeout(ms)
const advanceAutosave = (page) => page.waitForTimeout(AUTOSAVE_MS)
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })

const dom = (page) =>
  page.evaluate(() => {
    const nodeText = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.data
      if (node.nodeName === 'BR') return ''
      let text = ''
      for (const child of node.childNodes) text += nodeText(child)
      return text
    }
    const isLineDiv = (node) => node.nodeType === Node.ELEMENT_NODE && node.tagName === 'DIV'
    const readPlainText = (element) => {
      const children = [...element.childNodes]
      if (!children.some(isLineDiv)) return nodeText(element)
      const lines = []
      let prefix = ''
      for (const child of children) {
        if (isLineDiv(child)) lines.push(nodeText(child))
        else if (lines.length === 0) prefix += nodeText(child)
        else lines[lines.length - 1] += nodeText(child)
      }
      if (prefix !== '') lines[0] = prefix + (lines[0] ?? '')
      return lines.join('\n')
    }
    return [...document.querySelectorAll('[data-row-id]')].map((row) => {
      const editable = row.querySelector('div[contenteditable]')
      return {
        id: row.getAttribute('data-row-id'),
        type: row.getAttribute('data-block-type'),
        text: editable ? readPlainText(editable) : '',
        selected: row.getAttribute('data-selected') === 'true'
      }
    })
  })
const texts = (page) => dom(page).then((rows) => rows.map((r) => r.text))
const types = (page) => dom(page).then((rows) => rows.map((r) => r.type))
const state = (page) => page.evaluate(() => window.__mockState())
const focusedBlock = (page) =>
  page.evaluate(() => document.activeElement?.getAttribute?.('data-block-id') ?? null)

const caretOffset = (page) =>
  page.evaluate(() => {
    // Réplica exacta de getCaretOffset (editor/caret.ts).
    const nodeText = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.data
      if (node.nodeName === 'BR') return ''
      let text = ''
      for (const child of node.childNodes) text += nodeText(child)
      return text
    }
    const el = document.activeElement
    if (!el || !el.getAttribute || !el.getAttribute('data-block-id')) return null
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    if (!el.contains(range.startContainer)) return null
    const children = [...el.childNodes]
    const offsetWithin = (node, container, containerOffset) => {
      let offset = 0
      let found = false
      const walk = (current) => {
        if (found) return
        if (current === container) {
          if (current.nodeType === Node.TEXT_NODE) {
            offset += containerOffset
          } else {
            const kids = [...current.childNodes]
            for (let i = 0; i < containerOffset && i < kids.length; i++) {
              offset += nodeText(kids[i]).length
            }
          }
          found = true
          return
        }
        if (current.nodeType === Node.TEXT_NODE) {
          offset += current.data.length
          return
        }
        if (current.nodeName === 'BR') return
        for (const child of current.childNodes) {
          walk(child)
          if (found) return
        }
      }
      walk(node)
      return offset
    }
    if (range.startContainer === el) {
      let offset = 0
      for (let i = 0; i < range.startOffset && i < children.length; i++) {
        if (i > 0) offset += 1
        offset += nodeText(children[i]).length
      }
      return offset
    }
    let offset = 0
    for (let i = 0; i < children.length; i++) {
      if (i > 0) offset += 1
      const line = children[i]
      if (line === range.startContainer) {
        if (line.nodeType === Node.TEXT_NODE) {
          offset += range.startOffset
          return offset
        }
        const kids = [...line.childNodes]
        for (let c = 0; c < range.startOffset && c < kids.length; c++) {
          offset += nodeText(kids[c]).length
        }
        return offset
      }
      if (line.contains(range.startContainer)) {
        return offset + offsetWithin(line, range.startContainer, range.startOffset)
      }
      offset += nodeText(line).length
    }
    return offset
  })

const selectionInfo = (page) =>
  page.evaluate(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    const blockOf = (node) => {
      const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
      return el?.closest?.('[data-block-id]')?.getAttribute('data-block-id') ?? null
    }
    return {
      collapsed: sel.isCollapsed,
      anchorOffset: sel.anchorOffset,
      focusOffset: sel.focusOffset,
      direction: sel.anchorNode === range.startContainer && sel.anchorOffset === range.startOffset
        ? 'forward'
        : sel.anchorNode === range.endContainer && sel.anchorOffset === range.endOffset
          ? 'backward'
          : 'cross/unknown',
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      startBlock: blockOf(range.startContainer),
      endBlock: blockOf(range.endContainer),
      text: sel.toString(),
      rects: [...range.getClientRects()].map((rect) => ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }))
    }
  })

async function setup(page) {
  await page.goto(URL)
  await page.waitForSelector('div[contenteditable]')
  await page.evaluate(() => window.__mockReset())
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 250)
}

async function seed(page, blocks) {
  await page.evaluate((seedBlocks) => {
    localStorage.setItem(
      '__synapse_e2e_mock__',
      JSON.stringify({
        pages: [
          {
            id: 'p1',
            title: 'Test',
            parentId: null,
            icon: null,
            position: 0,
            createdAt: 1,
            updatedAt: 1
          }
        ],
        blocks: seedBlocks
      })
    )
  }, blocks)
  await page.reload()
  await page.waitForSelector('[data-row-id]')
  await settle(page, 250)
}

function makeBlock(index, type, text, extra = {}) {
  return {
    id: `seed-${index}`,
    pageId: 'p1',
    type,
    content: JSON.stringify({ text }),
    position: index,
    indent: 0,
    createdAt: 1,
    updatedAt: 1,
    ...extra
  }
}

async function clickEditable(page, index, where = 'end') {
  const el = page.locator('[data-row-id]').nth(index).locator('div[contenteditable]')
  await el.click()
  if (where === 'end') await page.keyboard.press('End')
  else if (where === 'start') await page.keyboard.press('Home')
  await settle(page, 80)
}

async function pasteText(page, text) {
  await page.evaluate((t) => {
    const el = document.activeElement
    const dt = new DataTransfer()
    dt.setData('text/plain', t)
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    )
  }, text)
  await settle(page, 120)
}

const dispatchClipboard = (page, type) =>
  page.evaluate((eventType) => {
    const editable = document.activeElement
    const clipboard = new DataTransfer()
    const event = new ClipboardEvent(eventType, {
      clipboardData: clipboard,
      bubbles: true,
      cancelable: true
    })
    editable.dispatchEvent(event)
    return {
      defaultPrevented: event.defaultPrevented,
      text: clipboard.getData('text/plain')
    }
  }, type)

// ---------------------------------------------------------------------------
// Resolución de puntos y creación de rangos (réplica de setCaretOffset/offsetAt)
// ---------------------------------------------------------------------------
const RESOLVE_HELPERS = `() => {
  const nodeText = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.data
    if (node.nodeName === 'BR') return ''
    let text = ''
    for (const child of node.childNodes) text += nodeText(child)
    return text
  }
  const findPoint = (root, target) => {
    let remaining = target
    let result = null
    const walk = (node) => {
      if (result) return
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.data.length
        if (remaining <= length) { result = { node, offset: remaining }; return }
        remaining -= length
        return
      }
      if (node.nodeName === 'BR') return
      for (const child of node.childNodes) { walk(child); if (result) return }
    }
    walk(root)
    return result
  }
  const resolvePoint = (editable, offset) => {
    const children = [...editable.childNodes]
    let remaining = offset
    for (let index = 0; index < children.length; index++) {
      if (index > 0) {
        if (remaining === 0) return { node: children[index], offset: 0 }
        remaining -= 1
      }
      const line = children[index]
      const length = nodeText(line).length
      if (remaining <= length) {
        const point = findPoint(line, remaining)
        if (point) return point
        return { node: line, offset: 0 }
      }
      remaining -= length
    }
    return { node: editable, offset: children.length }
  }
  return { nodeText, findPoint, resolvePoint }
}`

const makeHelpers = (src) => `eval('(' + ${JSON.stringify(src)} + ')')()`

// Selecciona [startOffset, endOffset) del bloque rowIndex. `inverted` usa
// setBaseAndExtent con el ancla al final para simular arrastre hacia atrás.
const setRange = (page, rowIndex, startOffset, endOffset, inverted = false) =>
  page.evaluate(
    ({ rowIndex, startOffset, endOffset, inverted, helpers }) => {
      const { resolvePoint } = eval('(' + helpers + ')')()
      const editable = [...document.querySelectorAll('[data-row-id]')][rowIndex]?.querySelector(
        'div[contenteditable]'
      )
      if (!editable) return false
      editable.focus()
      const start = resolvePoint(editable, startOffset)
      const end = resolvePoint(editable, endOffset)
      const selection = window.getSelection()
      selection.removeAllRanges()
      if (inverted) {
        selection.setBaseAndExtent(end.node, end.offset, start.node, start.offset)
      } else {
        const range = document.createRange()
        range.setStart(start.node, start.offset)
        range.setEnd(end.node, end.offset)
        selection.addRange(range)
      }
      return true
    },
    { rowIndex, startOffset, endOffset, inverted, helpers: RESOLVE_HELPERS }
  )

// Posiciones explícitas: { text: n } dentro del texto, o { element: n } como
// container == editable con offset n (número de hijos).
const setCustomRange = (page, rowIndex, start, end) =>
  page.evaluate(
    ({ rowIndex, start, end, helpers }) => {
      const { resolvePoint } = eval('(' + helpers + ')')()
      const editable = [...document.querySelectorAll('[data-row-id]')][rowIndex]?.querySelector(
        'div[contenteditable]'
      )
      if (!editable) return false
      editable.focus()
      const resolve = (pos) =>
        pos.element !== undefined ? { node: editable, offset: pos.element } : resolvePoint(editable, pos.text)
      const range = document.createRange()
      const s = resolve(start)
      const e = resolve(end)
      range.setStart(s.node, s.offset)
      range.setEnd(e.node, e.offset)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    },
    { rowIndex, start, end, helpers: RESOLVE_HELPERS }
  )

// Rango que cruza bloques (fromRow → toRow).
const setCrossRange = (page, fromRow, fromOffset, toRow, toOffset) =>
  page.evaluate(
    ({ fromRow, fromOffset, toRow, toOffset, helpers }) => {
      const { resolvePoint } = eval('(' + helpers + ')')()
      const editables = [...document.querySelectorAll('[data-row-id]')].map((row) =>
        row.querySelector('div[contenteditable]')
      )
      const from = editables[fromRow]
      const to = editables[toRow]
      if (!from || !to) return false
      from.focus()
      const start = resolvePoint(from, fromOffset)
      const end = resolvePoint(to, toOffset)
      const range = document.createRange()
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    },
    { fromRow, fromOffset, toRow, toOffset, helpers: RESOLVE_HELPERS }
  )

// Coordenadas de pantalla del caret en un offset (para arrastres reales).
const pointRect = (page, rowIndex, offset) =>
  page.evaluate(
    ({ rowIndex, offset, helpers }) => {
      const { resolvePoint } = eval('(' + helpers + ')')()
      const editable = [...document.querySelectorAll('[data-row-id]')][rowIndex]?.querySelector(
        'div[contenteditable]'
      )
      if (!editable) return null
      const point = resolvePoint(editable, offset)
      const range = document.createRange()
      range.setStart(point.node, point.offset)
      range.collapse(true)
      const rect = range.getBoundingClientRect()
      return {
        x: rect.left,
        y: rect.top + Math.max(rect.height, 1) / 2
      }
    },
    { rowIndex, offset, helpers: RESOLVE_HELPERS }
  )

const dragSelect = async (page, rowIndex, fromOffset, toOffset) => {
  const from = await pointRect(page, rowIndex, fromOffset)
  const to = await pointRect(page, rowIndex, toOffset)
  if (!from || !to) return false
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 14 })
  await page.mouse.up()
  await settle(page, 120)
  return true
}

const dragCrossSelect = async (page, fromRow, fromOffset, toRow, toOffset) => {
  const from = await pointRect(page, fromRow, fromOffset)
  const to = await pointRect(page, toRow, toOffset)
  if (!from || !to) return false
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 18 })
  await page.mouse.up()
  await settle(page, 150)
  return true
}

// ------------------------------------------------- J. selección multilínea
async function stageJ(page) {
  const steps = []

  // J1 · pegar "X" sobre selección que cruza 3 líneas [1,5) de "ab\ncd\nef"
  await setup(page)
  await seed(page, [makeBlock(0, 'paragraph', 'ab\ncd\nef')])
  await setRange(page, 0, 1, 5)
  let sel = await selectionInfo(page)
  check(
    steps,
    'J1a el rango [1,5) selecciona "b\\ncd"',
    sel.collapsed === false && sel.text === 'b\ncd',
    sel
  )
  await pasteText(page, 'X')
  let rows = await dom(page)
  let off = await caretOffset(page)
  check(
    steps,
    'J1b pegar "X" sobre selección multilínea → "aX\\nef" con caret 2',
    rows.length === 1 && rows[0].text === 'aX\nef' && off === 2,
    { text: rows[0].text, off }
  )

  // J2 · Enter sobre selección multilínea de párrafo
  await seed(page, [makeBlock(0, 'paragraph', 'ab\ncd\nef')])
  await setRange(page, 0, 1, 5)
  await page.keyboard.press('Enter')
  await settle(page, 150)
  rows = await dom(page)
  let focus = await focusedBlock(page)
  check(
    steps,
    'J2 Enter sobre selección multilínea → "a" + "\\nef" con foco en el 2º',
    rows.length === 2 && rows[0].text === 'a' && rows[1].text === '\nef' && focus === rows[1].id,
    { rows: rows.map((r) => r.text), focus }
  )

  // J3 · Shift+Enter sobre selección multilínea
  await seed(page, [makeBlock(0, 'paragraph', 'ab\ncd\nef')])
  await setRange(page, 0, 1, 5)
  await page.keyboard.press('Shift+Enter')
  await settle(page, 150)
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'J3 Shift+Enter sobre selección multilínea → "a\\n\\nef" con caret 2',
    rows.length === 1 && rows[0].text === 'a\n\nef' && off === 2,
    { text: rows[0].text, off }
  )

  // J4 · pegar multilínea sobre selección multilínea
  await seed(page, [makeBlock(0, 'paragraph', 'ab\ncd\nef')])
  await setRange(page, 0, 1, 5)
  await pasteText(page, '1\n2')
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'J4 pegar "1\\n2" sobre "b\\ncd" → "a1\\n2\\nef" con caret 4',
    rows[0].text === 'a1\n2\nef' && off === 4,
    { text: rows[0].text, off }
  )

  // J5 · selección que termina en container == elemento (offset 2 = final)
  await seed(page, [makeBlock(0, 'paragraph', 'ab\ncd')])
  await setCustomRange(page, 0, { text: 1 }, { element: 2 })
  await pasteText(page, 'X')
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'J5 fin en container=elemento (offset 2) → "aX" con caret 2',
    rows[0].text === 'aX' && off === 2,
    { text: rows[0].text, off }
  )

  // J6 · selección que empieza en container == elemento (offset 1 = inicio línea 2)
  await seed(page, [makeBlock(0, 'paragraph', 'ab\ncd')])
  await setCustomRange(page, 0, { element: 1 }, { text: 4 })
  await pasteText(page, 'X')
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'J6 inicio en container=elemento (offset 1) → "abXd" con caret 3',
    rows[0].text === 'abXd' && off === 3,
    { text: rows[0].text, off }
  )

  // J7 · selección que cruza una línea vacía ("a\n\nb", offsets 1..3)
  await seed(page, [makeBlock(0, 'paragraph', 'a\n\nb')])
  await setRange(page, 0, 1, 3)
  sel = await selectionInfo(page)
  await pasteText(page, 'X')
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'J7 pegar sobre selección que cruza línea vacía → "aXb" con caret 2',
    rows[0].text === 'aXb' && off === 2,
    { text: rows[0].text, off, sel }
  )

  // J8 · Enter en code con selección multilínea [2,4) de "a\nb\nc"
  await seed(page, [makeBlock(0, 'code', 'a\nb\nc')])
  await setRange(page, 0, 2, 4)
  await page.keyboard.press('Enter')
  await settle(page, 150)
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'J8 Enter en code con selección "b\\n" → "a\\n\\nc" con caret 3',
    rows[0].text === 'a\n\nc' && off === 3,
    { text: rows[0].text, off }
  )

  // J9 · Enter con todo el bloque seleccionado
  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await setRange(page, 0, 0, 4)
  await page.keyboard.press('Enter')
  await settle(page, 150)
  rows = await dom(page)
  focus = await focusedBlock(page)
  check(
    steps,
    'J9 Enter con todo "abcd" seleccionado → dos párrafos vacíos con foco en el 2º',
    rows.length === 2 &&
      rows[0].text === '' &&
      rows[1].text === '' &&
      focus === rows[1].id,
    { rows: rows.map((r) => r.text), focus }
  )

  return { steps }
}

// ------------------------------------------------- K. selección invertida
async function stageK(page) {
  const steps = []

  // K1 · programática derecha→izquierda [3→1] de "abcd" (selecciona "bc")
  await setup(page)
  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await setRange(page, 0, 1, 3, true)
  let sel = await selectionInfo(page)
  check(
    steps,
    'K1a selección invertida [3→1] marca "bc"',
    sel.collapsed === false && sel.text === 'bc' && sel.direction === 'backward',
    sel
  )
  await pasteText(page, 'X')
  let rows = await dom(page)
  let off = await caretOffset(page)
  check(
    steps,
    'K1b pegar "X" sobre selección invertida → "aXd" con caret 2',
    rows[0].text === 'aXd' && off === 2,
    { text: rows[0].text, off }
  )

  // K2 · arrastre real derecha→izquierda sobre "abcd"
  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await dragSelect(page, 0, 3, 1)
  sel = await selectionInfo(page)
  await pasteText(page, 'X')
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'K2 arrastre real dcha→izda y pegar "X" → "aXd"',
    rows[0].text === 'aXd' && off === 2,
    { selection: sel, text: rows[0].text, off }
  )

  // K3 · invertida abajo→arriba cruzando líneas [3→0] de "a\nb"
  await seed(page, [makeBlock(0, 'paragraph', 'a\nb')])
  await setRange(page, 0, 0, 3, true)
  sel = await selectionInfo(page)
  await pasteText(page, 'X')
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'K3 pegar sobre invertida abajo→arriba multilínea → "X" con caret 1',
    rows[0].text === 'X' && off === 1,
    { selection: sel, text: rows[0].text, off }
  )

  // K4 · arrastre real abajo→arriba: de offset 4 a 0 en "ab\ncd" selecciona "ab\nc"
  await seed(page, [makeBlock(0, 'paragraph', 'ab\ncd')])
  await dragSelect(page, 0, 4, 0)
  sel = await selectionInfo(page)
  await pasteText(page, 'X')
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'K4 arrastre real abajo→arriba y pegar → "Xd"',
    rows[0].text === 'Xd' && off === 1,
    { selection: sel, text: rows[0].text, off }
  )

  return { steps }
}

// --------------------------------------------- L. pegar multilínea + undo/redo
async function stageL(page) {
  const steps = []
  await setup(page)

  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await setRange(page, 0, 1, 3)
  await pasteText(page, '1\n2')
  let rows = await dom(page)
  let off = await caretOffset(page)
  check(
    steps,
    'L1 pegar "1\\n2" sobre "bc" → "a1\\n2d" con caret 4',
    rows[0].text === 'a1\n2d' && off === 4,
    { text: rows[0].text, off }
  )

  await page.keyboard.press('Control+z')
  await settle(page, 150)
  rows = await dom(page)
  check(steps, 'L2 Ctrl+Z tras reemplazar selección vuelve a "abcd"', rows[0].text === 'abcd', rows[0])

  await page.keyboard.press('Control+Shift+z')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'L3 Ctrl+Shift+Z (redo) reactiva el pegado ("a1\\n2d")',
    rows[0].text === 'a1\n2d',
    rows[0]
  )

  // L4 · persistencia tras autosave del reemplazo de selección
  await advanceAutosave(page)
  let persisted = await state(page)
  check(
    steps,
    'L4 autosave persiste el texto reemplazado',
    persisted.blocks[0].content === JSON.stringify({ text: 'a1\n2d' }),
    persisted.blocks[0].content
  )

  // L5 · pegar "x\ny" sobre selección multilínea en code ("ab\ncd", [1,4) = "b\nc")
  await seed(page, [makeBlock(0, 'code', 'ab\ncd')])
  await setRange(page, 0, 1, 4)
  await pasteText(page, 'x\ny')
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'L5 pegar "x\\ny" sobre selección en code → "ax\\nyd"',
    rows[0].type === 'code' && rows[0].text === 'ax\nyd' && off === 4,
    { text: rows[0].text, off }
  )

  // L6 · Enter en code sobre selección + Ctrl+Z
  await seed(page, [makeBlock(0, 'code', 'a\nb\nc')])
  await setRange(page, 0, 2, 4)
  await page.keyboard.press('Enter')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'L6a Enter en code sobre selección deja "a\\n\\nc"',
    rows[0].text === 'a\n\nc',
    rows[0]
  )
  await page.keyboard.press('Control+z')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'L6b Ctrl+Z tras Enter sobre selección restaura "a\\nb\\nc"',
    rows[0].text === 'a\nb\nc',
    rows[0]
  )

  return { steps }
}

// ------------------------------------- M. Backspace/Delete nativo con selección
async function stageM(page) {
  const steps = []
  await setup(page)

  // M1 · Backspace sobre "bc" en "abcd"
  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await setRange(page, 0, 1, 3)
  await page.keyboard.press('Backspace')
  await settle(page, 150)
  let rows = await dom(page)
  check(steps, 'M1 Backspace sobre "bc" → "ad"', rows[0].text === 'ad', rows[0])

  // M1b · undo tras borrado nativo
  await page.keyboard.press('Control+z')
  await settle(page, 150)
  rows = await dom(page)
  check(steps, 'M1b Ctrl+Z tras Backspace con selección → "abcd"', rows[0].text === 'abcd', rows[0])

  // M2 · Delete sobre "bc" en "abcd"
  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await setRange(page, 0, 1, 3)
  await page.keyboard.press('Delete')
  await settle(page, 150)
  rows = await dom(page)
  check(steps, 'M2 Delete sobre "bc" → "ad"', rows[0].text === 'ad', rows[0])

  // M3 · Backspace sobre [0,2) en 2º bloque NO debe fusionar con el anterior
  await seed(page, [makeBlock(0, 'paragraph', 'zz'), makeBlock(1, 'paragraph', 'abcd')])
  await setRange(page, 1, 0, 2)
  await page.keyboard.press('Backspace')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'M3 Backspace con selección en offset 0 no fusiona bloques ["zz","cd"]',
    rows.length === 2 && rows[0].text === 'zz' && rows[1].text === 'cd',
    rows.map((r) => r.text)
  )

  // M4 · Delete sobre [2,4) en 1er bloque NO debe fusionar con el siguiente
  await seed(page, [makeBlock(0, 'paragraph', 'abcd'), makeBlock(1, 'paragraph', 'zz')])
  await setRange(page, 0, 2, 4)
  await page.keyboard.press('Delete')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'M4 Delete con selección al final no fusiona bloques ["ab","zz"]',
    rows.length === 2 && rows[0].text === 'ab' && rows[1].text === 'zz',
    rows.map((r) => r.text)
  )

  // M5 · Backspace sobre selección multilínea en code
  await seed(page, [makeBlock(0, 'code', 'a\nb\nc')])
  await setRange(page, 0, 2, 4)
  await page.keyboard.press('Backspace')
  await settle(page, 150)
  rows = await dom(page)
  check(steps, 'M5 Backspace sobre "b\\n" en code → "a\\nc"', rows[0].text === 'a\nc', rows[0])

  // M6 · Backspace sobre selección que cruza línea vacía
  await seed(page, [makeBlock(0, 'paragraph', 'a\n\nb')])
  await setRange(page, 0, 1, 3)
  await page.keyboard.press('Backspace')
  await settle(page, 150)
  rows = await dom(page)
  check(steps, 'M6 Backspace sobre selección con línea vacía → "ab"', rows[0].text === 'ab', rows[0])

  // M7 · Backspace sobre selección invertida
  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await setRange(page, 0, 1, 3, true)
  await page.keyboard.press('Backspace')
  await settle(page, 150)
  rows = await dom(page)
  check(steps, 'M7 Backspace sobre selección invertida → "ad"', rows[0].text === 'ad', rows[0])

  return { steps }
}

// ------------------------------------------------- N. límites de offsetAt extra
async function stageN(page) {
  const steps = []
  await setup(page)

  // N1 · rango [elemento 0, texto 4] de "ab\ncd": todo el bloque
  await seed(page, [makeBlock(0, 'paragraph', 'ab\ncd')])
  await setCustomRange(page, 0, { element: 0 }, { text: 4 })
  await pasteText(page, 'X')
  let rows = await dom(page)
  let off = await caretOffset(page)
  check(
    steps,
    'N1 rango [elemento0, texto4] → "Xd" con caret 1',
    rows[0].text === 'Xd' && off === 1,
    { text: rows[0].text, off }
  )

  // N2 · rango [elemento 0, elemento 1]: solo los caracteres de la 1ª línea;
  // el salto virtual "\n" (offset 2) no forma parte del rango, así que queda.
  await seed(page, [makeBlock(0, 'paragraph', 'ab\ncd')])
  await setCustomRange(page, 0, { element: 0 }, { element: 1 })
  await pasteText(page, 'X')
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'N2 rango [elemento0, elemento1] (sin el salto) → "X\\ncd"',
    rows[0].text === 'X\ncd' && off === 1,
    { text: rows[0].text, off }
  )

  // N3 · rango [elemento 1, elemento 2] (segunda línea)
  await seed(page, [makeBlock(0, 'paragraph', 'ab\ncd')])
  await setCustomRange(page, 0, { element: 1 }, { element: 2 })
  await pasteText(page, 'X')
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'N3 rango [elemento1, elemento2] (segunda línea) → "abX"',
    rows[0].text === 'abX' && off === 3,
    { text: rows[0].text, off }
  )

  return { steps }
}

// ------------------------------------------- O. selección que cruza bloques
async function stageO(page) {
  const steps = []
  await setup(page)

  // O1 · arrastre real de bloque 0 a bloque 1 crea un rango sintético cruzado.
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh')
  ])
  await dragCrossSelect(page, 0, 1, 1, 2)
  let sel = await selectionInfo(page)
  const endRowBounds = await page.locator('[data-row-id="seed-1"]').boundingBox()
  const paintsEndBlock = Boolean(
    endRowBounds &&
      sel.rects.some(
        (rect) => rect.y < endRowBounds.y + endRowBounds.height && rect.y + rect.height > endRowBounds.y
      )
  )
  check(
    steps,
    'O1a el arrastre ratón bloque0→bloque1 selecciona ambos bloques',
    sel.collapsed === false &&
      sel.startBlock === 'seed-0' &&
      sel.endBlock === 'seed-1' &&
      paintsEndBlock,
    { selection: sel, paintsEndBlock }
  )
  await pasteText(page, 'X')
  await settle(page, 150)
  let rows = await dom(page)
  check(
    steps,
    'O1b pegar sobre el rango cruzado → ["aX","gh"]',
    rows.length === 2 && rows[0].text === 'aX' && rows[1].text === 'gh',
    { rows: rows.map((r) => r.text), selection: sel }
  )

  // O2 · el mismo reemplazo con un rango sintético creado directamente.
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh')
  ])
  await setCrossRange(page, 0, 1, 1, 2)
  sel = await selectionInfo(page)
  note(steps, 'O2a selección programática cruzada', sel)
  await pasteText(page, 'X')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'O2 pegar sobre selección cruzada programática → ["aX","gh"]',
    rows.length === 2 && rows[0].text === 'aX' && rows[1].text === 'gh',
    { rows: rows.map((r) => r.text), selection: sel }
  )

  // O3 · Backspace nativo sobre selección cruzada
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh')
  ])
  await setCrossRange(page, 0, 1, 1, 2)
  await page.keyboard.press('Backspace')
  await settle(page, 200)
  rows = await dom(page)
  check(
    steps,
    'O3 Backspace sobre selección cruzada borra ambos tramos ["a","gh"]',
    rows.length === 2 && rows[0].text === 'a' && rows[1].text === 'gh',
    rows.map((r) => r.text)
  )

  // O4 · Delete nativo sobre selección cruzada
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh')
  ])
  await setCrossRange(page, 0, 1, 1, 2)
  await page.keyboard.press('Delete')
  await settle(page, 200)
  rows = await dom(page)
  check(
    steps,
    'O4 Delete sobre selección cruzada borra ambos tramos ["a","gh"]',
    rows.length === 2 && rows[0].text === 'a' && rows[1].text === 'gh',
    rows.map((r) => r.text)
  )

  // O5 · copy/cut genera su propio text/plain cuando Chromium no expone
  // clipboardData para un rango que cruza editing hosts.
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh')
  ])
  await setCrossRange(page, 0, 1, 1, 2)
  const copied = await dispatchClipboard(page, 'copy')
  check(
    steps,
    'O5 copy publica el texto de ambos bloques en text/plain',
    copied.defaultPrevented && copied.text === 'bcd\nef',
    copied
  )

  await setCrossRange(page, 0, 1, 1, 2)
  const cut = await dispatchClipboard(page, 'cut')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'O6 cut copia el rango y elimina ambos tramos',
    cut.defaultPrevented &&
      cut.text === 'bcd\nef' &&
      rows.length === 2 &&
      rows[0].text === 'a' &&
      rows[1].text === 'gh',
    { cut, rows: rows.map((r) => r.text) }
  )
  await page.keyboard.press('Control+z')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'O6b undo revierte el corte en una sola operación',
    rows.length === 2 && rows[0].text === 'abcd' && rows[1].text === 'efgh',
    rows.map((r) => r.text)
  )

  // O7 · Ctrl+A y escritura reemplazan texto en toda la página.
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh')
  ])
  await clickEditable(page, 0, 'start')
  await page.keyboard.press('Control+a')
  sel = await selectionInfo(page)
  check(
    steps,
    'O7a Ctrl+A selecciona desde el primer hasta el último bloque',
    sel.startBlock === 'seed-0' && sel.endBlock === 'seed-1' && !sel.collapsed,
    sel
  )
  await page.keyboard.insertText('X')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'O7b escribir sobre Ctrl+A reemplaza el texto de ambos bloques',
    rows.length === 2 && rows[0].text === 'X' && rows[1].text === '',
    rows.map((r) => r.text)
  )

  // O8 · Shift+ArrowDown extiende el caret al siguiente bloque conservando columna.
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh')
  ])
  await clickEditable(page, 0, 'start')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  sel = await selectionInfo(page)
  check(
    steps,
    'O8 Shift+ArrowDown crea selección de texto entre bloques',
    sel.startBlock === 'seed-0' && sel.endBlock === 'seed-1' && !sel.collapsed,
    sel
  )

  // O9 · Shift+click extiende desde el caret anterior a otro bloque.
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh')
  ])
  const startPoint = await pointRect(page, 0, 1)
  const endPoint = await pointRect(page, 1, 2)
  await page.mouse.click(startPoint.x, startPoint.y)
  await page.keyboard.down('Shift')
  await page.mouse.click(endPoint.x, endPoint.y)
  await page.keyboard.up('Shift')
  await settle(page, 100)
  sel = await selectionInfo(page)
  check(
    steps,
    'O9 Shift+click extiende el rango al segundo bloque',
    sel.startBlock === 'seed-0' && sel.endBlock === 'seed-1' && !sel.collapsed,
    sel
  )

  // O10 · Enter elimina el rango y conserva el separador estructural.
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh')
  ])
  await setCrossRange(page, 0, 1, 1, 2)
  await page.keyboard.press('Enter')
  await settle(page, 200)
  rows = await dom(page)
  const focus = await focusedBlock(page)
  check(
    steps,
    'O10 Enter elimina ambos tramos y enfoca el texto posterior',
    rows.length === 2 && rows[0].text === 'a' && rows[1].text === 'gh' && focus === 'seed-1',
    { rows: rows.map((r) => r.text), focus }
  )

  // O11 · Shift+Enter sustituye el rango por un salto de línea.
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh')
  ])
  await setCrossRange(page, 0, 1, 1, 2)
  await page.keyboard.press('Shift+Enter')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'O11 Shift+Enter sustituye el rango cruzado por un salto',
    rows.length === 2 && rows[0].text === 'a\n' && rows[1].text === 'gh',
    rows.map((r) => r.text)
  )

  // O12 · la flecha vertical sigue la línea visual cuando el texto hace wrap.
  await page.setViewportSize({ width: 800, height: 800 })
  await seed(page, [makeBlock(0, 'paragraph', 'word '.repeat(60))])
  await clickEditable(page, 0, 'start')
  for (let index = 0; index < 20; index++) await page.keyboard.press('ArrowRight')
  const anchorOffset = await caretOffset(page)
  await page.keyboard.press('Shift+ArrowDown')
  sel = await selectionInfo(page)
  check(
    steps,
    'O12 Shift+ArrowDown selecciona hacia la siguiente línea renderizada',
    sel.startBlock === 'seed-0' &&
      sel.endBlock === 'seed-0' &&
      !sel.collapsed &&
      sel.focusOffset > anchorOffset,
    { anchorOffset, selection: sel }
  )
  await page.setViewportSize({ width: 1280, height: 800 })

  // O13 · borrar solo el separador lógico une ambos bloques.
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh')
  ])
  await setCrossRange(page, 0, 4, 1, 0)
  await page.keyboard.press('Backspace')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'O13 Backspace sobre el separador de bloques los une',
    rows.length === 1 && rows[0].id === 'seed-0' && rows[0].text === 'abcdefgh',
    rows.map((r) => r.text)
  )

  // O14 · cambiar de selección de texto a selección de bloques colapsa el rango anterior.
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh'),
    makeBlock(2, 'paragraph', 'ijkl')
  ])
  await clickEditable(page, 0, 'start')
  await setCrossRange(page, 0, 1, 1, 2)
  const whitespaceRow = await page.locator('[data-row-id="seed-1"]').boundingBox()
  await page.keyboard.down('Shift')
  await page.mouse.click(
    whitespaceRow.x + whitespaceRow.width - 24,
    whitespaceRow.y + whitespaceRow.height / 2
  )
  await page.keyboard.up('Shift')
  await settle(page, 100)
  rows = await dom(page)
  sel = await selectionInfo(page)
  check(
    steps,
    'O14a Shift+click en espacio de fila selecciona bloques y colapsa el rango de texto',
    rows.slice(0, 2).every((row) => row.selected) && !rows[2].selected && sel.collapsed,
    { selected: rows.map((r) => r.selected), selection: sel }
  )
  await page.keyboard.press('Shift+ArrowDown')
  await settle(page, 100)
  rows = await dom(page)
  check(
    steps,
    'O14b Shift+Arrow extiende la selección de bloques activa',
    rows.every((row) => row.selected),
    rows.map((r) => r.selected)
  )

  // O15 · Ctrl+Shift+click explícito selecciona bloques incluso sobre texto visible.
  await seed(page, [
    makeBlock(0, 'paragraph', 'abcd'),
    makeBlock(1, 'paragraph', 'efgh'),
    makeBlock(2, 'paragraph', 'ijkl'),
    makeBlock(3, 'paragraph', 'mnop')
  ])
  await clickEditable(page, 0, 'start')
  const blockTextPoint = await pointRect(page, 2, 1)
  await page.keyboard.down('Control')
  await page.keyboard.down('Shift')
  await page.mouse.click(blockTextPoint.x, blockTextPoint.y)
  await page.keyboard.up('Shift')
  await page.keyboard.up('Control')
  await settle(page, 100)
  rows = await dom(page)
  check(
    steps,
    'O15a Ctrl+Shift+click sobre glifo conserva el modo de selección de bloques',
    rows.slice(0, 3).every((row) => row.selected) && !rows[3].selected,
    rows.map((r) => r.selected)
  )
  await page.keyboard.press('Shift+ArrowDown')
  await settle(page, 100)
  rows = await dom(page)
  check(
    steps,
    'O15b Shift+Arrow extiende desde el extremo del rango de bloques',
    rows.every((row) => row.selected),
    rows.map((r) => r.selected)
  )

  return { steps }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push('[console] ' + msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push('[pageerror] ' + err.message))
  await page.addInitScript({ path: MOCK })

  const stages = [
    ['J · selección multilínea en un bloque', stageJ],
    ['K · selección invertida', stageK],
    ['L · pegar multilínea + undo/redo', stageL],
    ['M · Backspace/Delete con selección', stageM],
    ['N · límites offsetAt (elemento)', stageN],
    ['O · selección que cruza bloques', stageO]
  ]
  for (const [name, fn] of stages) {
    try {
      const result = await fn(page)
      report.stages.push({ name, steps: result.steps })
    } catch (error) {
      report.stages.push({ name, fatal: String(error && error.stack ? error.stack : error) })
      try {
        await shot(page, `advsel-fatal-${name.split(' ')[0]}.png`)
      } catch {}
    }
  }

  await browser.close()
  const failures = report.stages.flatMap((stage) =>
    (stage.steps ?? []).filter((s) => !s.ok).map((s) => `${stage.name}: ${s.name}`)
  )
  report.summary = {
    totalChecks: report.stages.flatMap((stage) =>
      (stage.steps ?? []).filter((s) => !s.note)
    ).length,
    failedChecks: failures,
    fatalStages: report.stages.filter((s) => s.fatal).map((s) => s.name),
    consoleErrors
  }
  fs.writeFileSync(
    path.join(OUT, 'e2e-selection-adversarial-report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report.summary, null, 2))
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
