// Suite adversarial de la Fase 4 (Synapse). Solo lectura del repo: no modifica
// código de producción. Reutiliza e2e/mock-api.js y el patrón de e2e/phase4.e2e.cjs.
//
// Uso: node e2e/adv-phase4.e2e.cjs
const { chromium } = require('/home/togu/.npm/_npx/86170c4cd1c5da32/node_modules/playwright')
const path = require('node:path')
const fs = require('node:fs')

const URL = 'http://localhost:5174/'
const MOCK = path.join(__dirname, 'mock-api.js')
const OUT = '/tmp/opencode'
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
    // Réplica exacta de readPlainText (editor/caret.ts): cada línea vive en un
    // <div> hijo y los saltos deben reconstruirse uniendo con '\n'.
    const nodeText = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.data
      if (node.nodeName === 'BR') return ''
      let text = ''
      for (const child of node.childNodes) text += nodeText(child)
      return text
    }
    const isLineDiv = (node) =>
      node.nodeType === Node.ELEMENT_NODE && node.tagName === 'DIV'
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
        marginLeft: row.style.marginLeft,
        checked: row.getAttribute('data-checked'),
        selected: row.getAttribute('data-selected') === 'true'
      }
    })
  })
const texts = (page) => dom(page).then((rows) => rows.map((r) => r.text))
const state = (page) => page.evaluate(() => window.__mockState())
const focusedBlock = (page) =>
  page.evaluate(() => document.activeElement?.getAttribute?.('data-block-id') ?? null)
const activeTag = (page) => page.evaluate(() => document.activeElement?.tagName ?? null)
const caretOffset = (page) =>
  page.evaluate(() => {
    // Réplica exacta de getCaretOffset (editor/caret.ts), contando el '\n'
    // implícito entre cada <div> de línea.
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
    return {
      collapsed: sel.isCollapsed,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      text: sel.toString()
    }
  })
const activeSlashItem = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-slash-item][data-active="true"]')
    return el ? el.getAttribute('data-slash-item') : null
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

// Coloca el caret de forma determinista replicando setCaretOffset (caret.ts),
// para no depender de dónde aterriza el click en bloques multilínea.
const placeCaret = (page, rowIndex, offset) =>
  page.evaluate(
    ({ rowIndex, offset }) => {
      const editable = [...document.querySelectorAll('[data-row-id]')][rowIndex]?.querySelector(
        'div[contenteditable]'
      )
      if (!editable) return false
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
            if (remaining <= length) {
              result = { node, offset: remaining }
              return
            }
            remaining -= length
            return
          }
          if (node.nodeName === 'BR') return
          for (const child of node.childNodes) {
            walk(child)
            if (result) return
          }
        }
        walk(root)
        return result
      }
      editable.focus()
      const selection = window.getSelection()
      const range = document.createRange()
      const children = [...editable.childNodes]
      let remaining = offset
      let placed = false
      for (let index = 0; index < children.length && !placed; index++) {
        if (index > 0) {
          if (remaining === 0) {
            range.setStart(children[index], 0)
            placed = true
            break
          }
          remaining -= 1
        }
        const line = children[index]
        const length = nodeText(line).length
        if (remaining <= length) {
          const point = findPoint(line, remaining)
          if (point) range.setStart(point.node, point.offset)
          else range.setStart(line, 0)
          placed = true
          break
        }
        remaining -= length
      }
      if (placed) range.collapse(true)
      else {
        range.selectNodeContents(editable)
        range.collapse(false)
      }
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    },
    { rowIndex, offset }
  )

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

const openSlash = async (page) => {
  await page.keyboard.type('/')
  await page.waitForSelector('[data-slash-menu]')
}
const closeMenu = async (page) => {
  await page.keyboard.press('Escape')
  await settle(page)
}

async function dragStart(page, index) {
  const handle = page.locator('[data-row-id]').nth(index).locator('[data-block-handle]')
  const box = await handle.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  return { x, y }
}
const rootLeft = (page) =>
  page.evaluate(
    () => document.querySelector('[data-row-id]').parentElement.getBoundingClientRect().left
  )

// ---------------------------------------------------------------- A. markdown
async function stageA(page) {
  const steps = []

  // A1 · pegar texto plano multilínea
  await setup(page)
  await clickEditable(page, 0)
  await pasteText(page, 'canción ñandú\nsegunda línea')
  let rows = await dom(page)
  check(
    steps,
    'A1 pegar texto plano multlínea conserva texto y tipo',
    rows.length === 1 && rows[0].type === 'paragraph' && rows[0].text === 'canción ñandú\nsegunda línea',
    rows[0]
  )

  // A1b · pegar markdown "# ..." en párrafo vacío (observación)
  await setup(page)
  await clickEditable(page, 0)
  await pasteText(page, '# Título\ncuerpo')
  rows = await dom(page)
  note(steps, 'A1b observar pegado de markdown "# Título\\ncuerpo"', {
    type: rows[0].type,
    text: rows[0].text
  })

  // A2 · "---x" no debe ser divider
  await seed(page, [makeBlock(0, 'paragraph', 'x')])
  await clickEditable(page, 0, 'start')
  await page.keyboard.type('---')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'A2 "---" delante de texto existente ("---x") NO convierte en divider',
    rows[0].type === 'paragraph' && rows[0].text === '---x',
    rows[0]
  )

  // A3 · "#" sin espacio no convierte
  await seed(page, [makeBlock(0, 'paragraph', '')])
  await clickEditable(page, 0)
  await page.keyboard.type('#x')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'A3 "#x" (sin espacio) NO convierte en heading',
    rows[0].type === 'paragraph' && rows[0].text === '#x',
    rows[0]
  )

  // A4 · regla al final / mitad de bloque
  await seed(page, [makeBlock(0, 'paragraph', 'abc')])
  await clickEditable(page, 0, 'end')
  await page.keyboard.type('# ')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'A4 "# " al final ("abc# ") NO convierte en heading',
    rows[0].type === 'paragraph' && rows[0].text === 'abc# ',
    rows[0]
  )

  // A5 · reglas dentro de code (deben quedar literales)
  await seed(page, [makeBlock(0, 'code', '')])
  await clickEditable(page, 0)
  await page.keyboard.type('---')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'A5 "---" en code NO convierte (texto literal)',
    rows[0].type === 'code' && rows[0].text === '---',
    rows[0]
  )
  await page.keyboard.press('Enter')
  await page.keyboard.type('# ')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'A5b "# " en code NO convierte (texto literal)',
    rows[0].type === 'code' && rows[0].text === '---\n# ',
    rows[0]
  )
  // A5d · Shift+Enter en párrafo y tecleo posterior (bug de caret)
  await seed(page, [makeBlock(0, 'paragraph', 'abc')])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('Shift+Enter')
  await settle(page)
  await page.keyboard.type('x')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'A5d tras Shift+Enter el texto tecleado va después del salto ("abc\\nx")',
    rows[0].text === 'abc\nx',
    rows[0]
  )

  // A5e · Enter en code y tecleo posterior (bug de caret)
  await seed(page, [makeBlock(0, 'code', '---')])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('Enter')
  await settle(page)
  await page.keyboard.type('x')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'A5e tras Enter en code el texto tecleado va después del salto ("---\\nx")',
    rows[0].text === '---\nx',
    rows[0]
  )

  // en code el atajo "/" abre el menú; Escape debe reinsertar la query
  await seed(page, [makeBlock(0, 'code', '')])
  await clickEditable(page, 0)
  await openSlash(page)
  await page.keyboard.type('cita')
  await closeMenu(page)
  rows = await dom(page)
  check(
    steps,
    'A5c Escape del slash menu dentro de code reinserta "/cita"',
    rows[0].type === 'code' && rows[0].text === '/cita',
    rows[0]
  )

  // A6 · reglas dentro de quote/bullet/todo (observación de conversión)
  await seed(page, [
    makeBlock(0, 'quote', 'cita'),
    makeBlock(1, 'bullet', 'item'),
    makeBlock(2, 'todo', 'tarea')
  ])
  await clickEditable(page, 0, 'start')
  await page.keyboard.type('# ')
  await settle(page)
  rows = await dom(page)
  note(steps, 'A6a "# " al inicio de quote → tipo resultante', {
    type: rows[0].type,
    text: rows[0].text
  })
  await clickEditable(page, 1, 'start')
  await page.keyboard.type('[] ')
  await settle(page)
  rows = await dom(page)
  note(steps, 'A6b "[] " al inicio de bullet → tipo resultante', {
    type: rows[1].type,
    text: rows[1].text,
    checked: rows[1].checked
  })
  await clickEditable(page, 2, 'start')
  await page.keyboard.type('> ')
  await settle(page)
  rows = await dom(page)
  note(steps, 'A6c "> " al inicio de todo → tipo resultante', {
    type: rows[2].type,
    text: rows[2].text,
    checked: rows[2].checked
  })

  // A7 · undo justo después de conversión
  await seed(page, [makeBlock(0, 'paragraph', '')])
  await clickEditable(page, 0)
  await page.keyboard.type('# ')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'A7a "# " convierte en heading vacío',
    rows[0].type === 'heading' && rows[0].text === '',
    rows[0]
  )
  await page.keyboard.press('Control+z')
  await settle(page)
  rows = await dom(page)
  check(steps, 'A7b Ctrl+Z revierte la conversión a párrafo', rows[0].type === 'paragraph', rows[0])
  note(steps, 'A7c texto tras undo de la conversión', rows[0].text)
  await page.keyboard.press('Control+Shift+z')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'A7d Ctrl+Shift+Z rehace la conversión a heading',
    rows[0].type === 'heading' && rows[0].text === '',
    rows[0]
  )

  // A8 · divider por tecleo: foco al párrafo nuevo
  await seed(page, [makeBlock(0, 'paragraph', '')])
  await clickEditable(page, 0)
  await page.keyboard.type('---')
  await settle(page)
  rows = await dom(page)
  const focus = await focusedBlock(page)
  check(
    steps,
    'A8a "---" crea divider + párrafo y enfoca el párrafo',
    rows.length === 2 && rows[0].type === 'divider' && rows[1].type === 'paragraph' && focus === rows[1].id,
    { rows, focus }
  )
  await page.keyboard.type('después')
  await settle(page)
  rows = await dom(page)
  check(steps, 'A8b se escribe en el párrafo tras el divider', rows[1].text === 'después', rows)
  await shot(page, 'adv-A8-divider.png')
  return { steps }
}

// ---------------------------------------------------------------- B. slash menu
async function stageB(page) {
  const steps = []

  // B1 · Escape con query tecleada
  await seed(page, [makeBlock(0, 'paragraph', 'hola')])
  await clickEditable(page, 0, 'end')
  await openSlash(page)
  await page.keyboard.type('cita')
  await closeMenu(page)
  let rows = await dom(page)
  let menuCount = await page.locator('[data-slash-menu]').count()
  check(
    steps,
    'B1 Escape con query reinserta "/cita" y cierra el menú',
    rows[0].text === 'hola/cita' && menuCount === 0,
    { rows: rows[0], menuCount }
  )
  const caret = await caretOffset(page)
  note(steps, 'B1b caret tras reinsertar', { caret, focused: await focusedBlock(page) })

  // B2 · filtro sin resultados + Enter (¿se traga el Enter?)
  await seed(page, [makeBlock(0, 'paragraph', '')])
  await clickEditable(page, 0)
  await openSlash(page)
  await page.keyboard.type('zzzz')
  const noResults = await page.locator('[data-slash-menu]').innerText()
  check(
    steps,
    'B2a query sin resultados muestra "Sin resultados"',
    noResults.includes('Sin resultados'),
    noResults
  )
  await page.keyboard.press('Enter')
  await settle(page)
  const stillOpen = (await page.locator('[data-slash-menu]').count()) === 1
  note(steps, 'B2b Enter sin resultados deja el menú abierto', { stillOpen })
  await closeMenu(page)
  rows = await dom(page)
  check(steps, 'B2c Escape tras Enter reinserta "/zzzz" sin perder texto', rows[0].text === '/zzzz', rows[0])

  // B3 · flechas en los bordes (wrap)
  await seed(page, [makeBlock(0, 'paragraph', '')])
  await clickEditable(page, 0)
  await openSlash(page)
  let active = await activeSlashItem(page)
  check(steps, 'B3a activo inicial = paragraph', active === 'paragraph', active)
  await page.keyboard.press('ArrowUp')
  active = await activeSlashItem(page)
  note(steps, 'B3b ArrowUp desde el primero (wrap o clamp)', active)
  await page.keyboard.press('ArrowDown')
  active = await activeSlashItem(page)
  check(steps, 'B3c ArrowDown vuelve a paragraph', active === 'paragraph', active)
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown')
  active = await activeSlashItem(page)
  check(steps, 'B3d 6×ArrowDown llega a divider', active === 'divider', active)
  await page.keyboard.press('ArrowDown')
  active = await activeSlashItem(page)
  note(steps, 'B3e ArrowDown en el último (wrap o clamp)', active)
  await closeMenu(page)
  rows = await dom(page)
  check(steps, 'B3f Escape sin query no escribe nada', rows[0].text === '', rows[0])

  // B4 · cerrar con click fuera
  await seed(page, [makeBlock(0, 'paragraph', 'abc')])
  await clickEditable(page, 0, 'end')
  await openSlash(page)
  await page.keyboard.type('divisor')
  const rootBox = await page.locator('[data-row-id]').first().boundingBox()
  await page.mouse.click(rootBox.x - 140, rootBox.y + 300)
  await settle(page, 200)
  rows = await dom(page)
  menuCount = await page.locator('[data-slash-menu]').count()
  check(
    steps,
    'B4 click fuera cierra el menú y reinserta "/divisor"',
    rows[0].text === 'abc/divisor' && menuCount === 0,
    { rows: rows[0], menuCount }
  )

  // B5 · insertar divider con bloque con texto
  await seed(page, [makeBlock(0, 'paragraph', 'texto')])
  await clickEditable(page, 0, 'end')
  await openSlash(page)
  await page.keyboard.type('divisor')
  await page.keyboard.press('Enter')
  await settle(page)
  rows = await dom(page)
  const focus = await focusedBlock(page)
  check(
    steps,
    'B5a "/divisor" con texto inserta divider debajo y párrafo enfocado',
    rows.length === 3 &&
      rows[0].type === 'paragraph' &&
      rows[0].text === 'texto' &&
      rows[1].type === 'divider' &&
      rows[2].type === 'paragraph' &&
      focus === rows[2].id,
    { rows, focus }
  )
  await page.keyboard.type('nuevo')
  await settle(page)
  rows = await dom(page)
  check(steps, 'B5b se escribe en el párrafo nuevo', rows[2].text === 'nuevo', rows)
  await page.keyboard.press('Control+z')
  await settle(page)
  await page.keyboard.press('Control+z')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'B5c Ctrl+Z (×2: tecleo + inserción) revierte el divider',
    rows.length === 1 && rows[0].type === 'paragraph' && rows[0].text === 'texto',
    rows
  )
  return { steps }
}

// ---------------------------------------------------------------- C. checkbox
async function stageC(page) {
  const steps = []

  // C1 · doble click rápido
  await seed(page, [makeBlock(0, 'todo', 'tarea'), makeBlock(1, 'paragraph', 'nota')])
  let checkbox = page.locator('[data-row-id]').nth(0).locator('[data-todo-checkbox]')
  await checkbox.dblclick({ delay: 30 })
  await settle(page)
  let rows = await dom(page)
  check(
    steps,
    'C1a doble click rápido termina desmarcado (2 toggles)',
    rows[0].checked === 'false',
    rows[0]
  )
  await checkbox.click()
  await settle(page)
  rows = await dom(page)
  check(steps, 'C1b un click posterior vuelve a marcar', rows[0].checked === 'true', rows[0])

  // C2 · undo/redo del check (con el foco donde lo deja el click)
  await seed(page, [makeBlock(0, 'todo', 'tarea'), makeBlock(1, 'paragraph', 'nota')])
  checkbox = page.locator('[data-row-id]').nth(0).locator('[data-todo-checkbox]')
  await checkbox.click()
  await settle(page)
  rows = await dom(page)
  check(steps, 'C2a click marca la tarea', rows[0].checked === 'true', rows[0])
  const tag = await activeTag(page)
  note(steps, 'C2b activeElement tras click en checkbox', tag)
  await page.keyboard.press('Control+z')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'C2c Ctrl+Z inmediato tras marcar deshace el check',
    rows[0].checked === 'false',
    { checked: rows[0].checked, activeElement: tag }
  )
  await page.keyboard.press('Control+y')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'C2c2 Ctrl+Y con foco en BODY rehace el check',
    rows[0].checked === 'true',
    { checked: rows[0].checked, activeElement: await activeTag(page) }
  )
  // con foco dentro del editor (partida limpia)
  await seed(page, [makeBlock(0, 'todo', 'tarea'), makeBlock(1, 'paragraph', 'nota')])
  checkbox = page.locator('[data-row-id]').nth(0).locator('[data-todo-checkbox]')
  await checkbox.click()
  await settle(page)
  await clickEditable(page, 1)
  await page.keyboard.press('Control+z')
  await settle(page)
  rows = await dom(page)
  check(steps, 'C2d Ctrl+Z con foco en el editor deshace el check', rows[0].checked === 'false', rows[0])
  await page.keyboard.press('Control+Shift+z')
  await settle(page)
  rows = await dom(page)
  check(steps, 'C2e Ctrl+Shift+Z rehace el check', rows[0].checked === 'true', rows[0])

  // C3 · persistencia del check tras reload
  await seed(page, [makeBlock(0, 'todo', 'persistente')])
  checkbox = page.locator('[data-row-id]').nth(0).locator('[data-todo-checkbox]')
  await checkbox.click()
  await advanceAutosave(page)
  let persisted = await state(page)
  check(
    steps,
    'C3a autosave guarda checked:true',
    persisted.blocks[0].content === '{"text":"persistente","checked":true}',
    persisted.blocks[0].content
  )
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 300)
  rows = await dom(page)
  check(steps, 'C3b checked sobrevive al reload', rows[0].checked === 'true', rows[0])
  checkbox = page.locator('[data-row-id]').nth(0).locator('[data-todo-checkbox]')
  await checkbox.click()
  await advanceAutosave(page)
  persisted = await state(page)
  check(
    steps,
    'C3c al desmarcar no queda "checked" en el content',
    persisted.blocks[0].content === '{"text":"persistente"}',
    persisted.blocks[0].content
  )
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 300)
  rows = await dom(page)
  check(steps, 'C3d desmarcado sobrevive al reload', rows[0].checked === 'false', rows[0])
  return { steps }
}

// ---------------------------------------------------------------- D. drag & drop
async function stageD(page) {
  const steps = []

  // D1 · soltar en el mismo sitio
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'paragraph', 'b'),
    makeBlock(2, 'paragraph', 'c')
  ])
  let { x, y } = await dragStart(page, 1)
  await page.mouse.move(x, y + 20, { steps: 6 })
  await page.mouse.move(x, y + 2, { steps: 4 })
  await settle(page, 80)
  await page.mouse.up()
  await settle(page, 220)
  let rows = await dom(page)
  check(
    steps,
    'D1 soltar en el mismo sitio no cambia orden ni indent',
    JSON.stringify(rows.map((r) => [r.text, r.marginLeft])) ===
      JSON.stringify([
        ['a', '0px'],
        ['b', '0px'],
        ['c', '0px']
      ]),
    rows.map((r) => `${r.text}@${r.marginLeft}`)
  )

  // D2 · arrastrar a la izquierda para desindentar
  await seed(page, [makeBlock(0, 'paragraph', 'a'), makeBlock(1, 'paragraph', 'b', { indent: 1 })])
  const left = await rootLeft(page)
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-row-id]')].map((r) => r.getBoundingClientRect().top)
  )
  ;({ x, y } = await dragStart(page, 1))
  await page.mouse.move(x - 10, y + 20, { steps: 6 })
  await page.mouse.move(left - 20, boxes[1] + 3, { steps: 8 })
  await settle(page, 80)
  await page.mouse.up()
  await settle(page, 220)
  rows = await dom(page)
  check(
    steps,
    'D2 arrastrar a la izquierda desindenta a 0',
    rows[1].text === 'b' && rows[1].marginLeft === '0px',
    rows.map((r) => `${r.text}@${r.marginLeft}`)
  )

  // D3 · arrastrar el único bloque
  await seed(page, [makeBlock(0, 'paragraph', 'solo')])
  ;({ x, y } = await dragStart(page, 0))
  await page.mouse.move(x, y + 30, { steps: 6 })
  await page.mouse.move(x, y + 120, { steps: 6 })
  await settle(page, 80)
  await page.mouse.up()
  await settle(page, 220)
  rows = await dom(page)
  check(
    steps,
    'D3 arrastrar el único bloque no lo duplica ni pierde',
    rows.length === 1 && rows[0].text === 'solo',
    rows
  )

  // D4 · hueco con indent inválido → clamp a prev+1
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'paragraph', 'b', { indent: 1 }),
    makeBlock(2, 'paragraph', 'c'),
    makeBlock(3, 'paragraph', 'd')
  ])
  const rootLeft2 = await rootLeft(page)
  ;({ x, y } = await dragStart(page, 3))
  await page.mouse.move(x, y + 40, { steps: 6 }) // arranca el drag
  await settle(page, 100)
  const freshTops = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-row-id]')].map((r) => [
        r.querySelector('div[contenteditable]')?.textContent,
        r.getBoundingClientRect().top
      ])
    )
  )
  // justo encima de "b" → hueco entre a y b, x muy a la derecha (indent ~5)
  await page.mouse.move(rootLeft2 + 130, freshTops.b - 1, { steps: 8 })
  await settle(page, 80)
  await page.mouse.up()
  await settle(page, 250)
  rows = await dom(page)
  check(
    steps,
    'D4 indent se recorta a prev+1 (1) al soltar en hueco',
    rows.map((r) => r.text).join(',') === 'a,d,b,c' && rows[1].marginLeft === '24px',
    rows.map((r) => `${r.text}@${r.marginLeft}`)
  )
  await shot(page, 'adv-D4-drag-clamp.png')

  // D5 · cancelar con Escape
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'paragraph', 'b'),
    makeBlock(2, 'paragraph', 'c')
  ])
  const tops = await page.evaluate(() =>
    [...document.querySelectorAll('[data-row-id]')].map((r) => r.getBoundingClientRect().top)
  )
  ;({ x, y } = await dragStart(page, 0))
  await page.mouse.move(x, tops[2] + 4, { steps: 10 })
  await settle(page, 80)
  await page.keyboard.press('Escape')
  await settle(page, 80)
  await page.mouse.up()
  await settle(page, 220)
  rows = await dom(page)
  check(
    steps,
    'D5 Escape cancela el arrastre',
    JSON.stringify(rows.map((r) => r.text)) === JSON.stringify(['a', 'b', 'c']),
    rows.map((r) => r.text)
  )
  return { steps }
}

// ---------------------------------------------------------------- E. multi-selección
async function stageE(page) {
  const steps = []

  // E1 · Shift+flechas en los bordes
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'paragraph', 'b'),
    makeBlock(2, 'paragraph', 'c')
  ])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('Shift+ArrowUp')
  await settle(page)
  let rows = await dom(page)
  check(
    steps,
    'E1a Shift+ArrowUp en el primero no cambia nada',
    rows.every((r) => !r.selected),
    rows.map((r) => r.selected)
  )
  await page.keyboard.press('Shift+ArrowDown')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'E1b Shift+ArrowDown selecciona 0..1 y enfoca b',
    rows.map((r) => r.selected).join(',') === 'true,true,false' &&
      (await focusedBlock(page)) === rows[1].id,
    { selected: rows.map((r) => r.selected), focus: await focusedBlock(page) }
  )
  await page.keyboard.press('Shift+ArrowDown')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'E1c Shift+ArrowDown extiende a 0..2',
    rows.map((r) => r.selected).join(',') === 'true,true,true',
    rows.map((r) => r.selected)
  )
  await page.keyboard.press('Shift+ArrowDown')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'E1d Shift+ArrowDown en el último no rompe la selección',
    rows.map((r) => r.selected).join(',') === 'true,true,true',
    rows.map((r) => r.selected)
  )
  await page.keyboard.press('Shift+ArrowUp')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'E1e Shift+ArrowUp encoge a 0..1',
    rows.map((r) => r.selected).join(',') === 'true,true,false',
    rows.map((r) => r.selected)
  )

  // E2 · Shift+click invertido (de abajo arriba)
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'paragraph', 'b'),
    makeBlock(2, 'paragraph', 'c'),
    makeBlock(3, 'paragraph', 'd')
  ])
  await clickEditable(page, 3)
  await page.locator('[data-row-id]').nth(0).click({ modifiers: ['Shift'] })
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'E2 Shift+click invertido selecciona 0..3',
    rows.map((r) => r.selected).join(',') === 'true,true,true,true',
    rows.map((r) => r.selected)
  )

  // E3 · borrar toda la selección → un párrafo vacío
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'paragraph', 'b'),
    makeBlock(2, 'paragraph', 'c')
  ])
  await clickEditable(page, 0)
  await page.locator('[data-row-id]').nth(2).click({ modifiers: ['Shift'] })
  await settle(page)
  await page.keyboard.press('Backspace')
  await settle(page)
  rows = await dom(page)
  const focus = await focusedBlock(page)
  check(
    steps,
    'E3a borrar toda la selección deja un párrafo vacío enfocado',
    rows.length === 1 && rows[0].type === 'paragraph' && rows[0].text === '' && focus === rows[0].id,
    { rows, focus }
  )
  await page.keyboard.type('nuevo')
  await settle(page)
  rows = await dom(page)
  check(steps, 'E3b se puede escribir en el párrafo resultante', rows[0].text === 'nuevo', rows[0])
  await shot(page, 'adv-E3-delete-all.png')

  // E4 · Ctrl+D sobre selección
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'paragraph', 'b'),
    makeBlock(2, 'paragraph', 'c')
  ])
  await clickEditable(page, 0)
  await page.locator('[data-row-id]').nth(2).click({ modifiers: ['Shift'] })
  await settle(page)
  await page.keyboard.press('Control+d')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'E4a Ctrl+D duplica la selección completa (a,b,c,a,b,c)',
    rows.length === 6 && rows.map((r) => r.text).join('') === 'abcabc',
    rows.map((r) => r.text)
  )
  check(
    steps,
    'E4b las 3 copias quedan seleccionadas',
    rows.filter((r) => r.selected).length === 3 && rows.slice(3).every((r) => r.selected),
    rows.map((r) => `${r.text}${r.selected ? '*' : ''}`)
  )
  await advanceAutosave(page)
  const persisted = await state(page)
  check(steps, 'E4c se persisten 6 bloques', persisted.blocks.length === 6, persisted.blocks.length)

  // E5 · undo/redo tras borrar
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'paragraph', 'b'),
    makeBlock(2, 'paragraph', 'c')
  ])
  await clickEditable(page, 0)
  await page.locator('[data-row-id]').nth(2).click({ modifiers: ['Shift'] })
  await settle(page)
  await page.keyboard.press('Backspace')
  await settle(page)
  await page.keyboard.press('Control+z')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'E5a Ctrl+Z restaura los 3 bloques',
    rows.length === 3 && rows.map((r) => r.text).join('') === 'abc',
    rows.map((r) => r.text)
  )
  await page.keyboard.press('Control+Shift+z')
  await settle(page)
  rows = await dom(page)
  check(
    steps,
    'E5b Ctrl+Shift+Z rehace el borrado (1 párrafo vacío)',
    rows.length === 1 && rows[0].text === '',
    rows
  )
  return { steps }
}

// ---------------------------------------------------------------- F. persistencia
async function stageF(page) {
  const steps = []

  // F1 · content legado {"text":...}
  await seed(page, [makeBlock(0, 'paragraph', 'viejo'), makeBlock(1, 'todo', 'tarea')])
  let rows = await dom(page)
  check(
    steps,
    'F1a content legado {"text":...} carga texto',
    rows[0].text === 'viejo' && rows[1].text === 'tarea',
    rows
  )
  check(steps, 'F1b todo legado sin checked carga desmarcado', rows[1].checked === 'false', rows[1])
  await clickEditable(page, 1, 'end')
  await page.keyboard.type('!')
  await advanceAutosave(page)
  let persisted = await state(page)
  const todoContent = persisted.blocks.find((b) => b.id === 'seed-1').content
  check(
    steps,
    'F1c editar todo legado persiste sin "checked"',
    todoContent === '{"text":"tarea!"}',
    todoContent
  )

  // F2 · checked solo cuando true
  await seed(page, [makeBlock(0, 'todo', 'x', { content: '{"text":"x","checked":true}' })])
  rows = await dom(page)
  check(steps, 'F2a content con checked:true carga marcado', rows[0].checked === 'true', rows[0])
  const checkbox = page.locator('[data-row-id]').nth(0).locator('[data-todo-checkbox]')
  await checkbox.click()
  await advanceAutosave(page)
  persisted = await state(page)
  check(
    steps,
    'F2b desmarcar persiste sin clave checked',
    persisted.blocks[0].content === '{"text":"x"}',
    persisted.blocks[0].content
  )
  await checkbox.click()
  await advanceAutosave(page)
  persisted = await state(page)
  check(
    steps,
    'F2c marcar persiste con checked:true',
    persisted.blocks[0].content === '{"text":"x","checked":true}',
    persisted.blocks[0].content
  )

  // F3 · content corrupto no rompe
  await seed(page, [
    makeBlock(0, 'paragraph', '', { content: 'no-json' }),
    makeBlock(1, 'paragraph', '', { content: '{"text":123}' })
  ])
  rows = await dom(page)
  check(
    steps,
    'F3 content corrupto carga como párrafos vacíos',
    rows.length === 2 && rows.every((r) => r.text === ''),
    rows
  )
  return { steps }
}

// ---------------------------------------------------------------- G. integración divider (sospechas)
async function stageG(page) {
  const steps = []

  // G1 · Backspace al inicio de un párrafo justo después de un divider
  await seed(page, [makeBlock(0, 'divider', ''), makeBlock(1, 'paragraph', 'texto')])
  await clickEditable(page, 1, 'start')
  await page.keyboard.press('Backspace')
  await settle(page)
  let rows = await dom(page)
  let focus = await focusedBlock(page)
  await advanceAutosave(page)
  const persisted = await state(page)
  check(
    steps,
    'G1 Backspace en offset 0 tras divider elimina el divider y conserva el texto enfocado',
    rows.length === 1 &&
      rows[0].type === 'paragraph' &&
      rows[0].text === 'texto' &&
      focus === rows[0].id &&
      persisted.blocks.length === 1 &&
      persisted.blocks[0].content === '{"text":"texto"}',
    {
      rows,
      focus,
      persisted: persisted.blocks.map((b) => ({ id: b.id, type: b.type, content: b.content }))
    }
  )
  await shot(page, 'adv-G1-backspace-after-divider.png')

  // G1b · Backspace en párrafo VACÍO justo después de un divider
  await seed(page, [makeBlock(0, 'divider', ''), makeBlock(1, 'paragraph', '')])
  await clickEditable(page, 1, 'start')
  await page.keyboard.press('Backspace')
  await settle(page)
  rows = await dom(page)
  focus = await focusedBlock(page)
  check(
    steps,
    'G1b Backspace en párrafo vacío tras divider elimina el divider y deja el párrafo enfocado',
    rows.length === 1 && rows[0].type === 'paragraph' && focus === rows[0].id,
    { rows, focus }
  )

  // G1c · mismo fallo con flujo 100% UI: teclear "---" y luego Backspace
  await seed(page, [makeBlock(0, 'paragraph', '')])
  await clickEditable(page, 0)
  await page.keyboard.type('---')
  await settle(page)
  await page.keyboard.press('Backspace')
  await settle(page)
  rows = await dom(page)
  focus = await focusedBlock(page)
  await advanceAutosave(page)
  const persistedG1c = await state(page)
  check(
    steps,
    'G1c flujo UI "---"+Backspace elimina el divider y deja un párrafo editable',
    rows.length === 1 && rows[0].type === 'paragraph' && focus === rows[0].id,
    { rows, focus, persisted: persistedG1c.blocks.map((b) => ({ type: b.type, content: b.content })) }
  )
  await shot(page, 'adv-G1c-ui-divider-backspace.png')

  // G2 · ArrowUp desde el bloque siguiente a un divider
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'divider', ''),
    makeBlock(2, 'paragraph', 'b')
  ])
  await clickEditable(page, 2, 'start')
  await page.keyboard.press('ArrowUp')
  await settle(page)
  focus = await focusedBlock(page)
  rows = await dom(page)
  check(steps, 'G2 ArrowUp salta el divider y enfoca "a"', focus === rows[0].id, {
    focus,
    expected: rows[0].id
  })

  // G3 · ArrowDown desde el bloque anterior a un divider
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'divider', ''),
    makeBlock(2, 'paragraph', 'b')
  ])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('ArrowDown')
  await settle(page)
  focus = await focusedBlock(page)
  rows = await dom(page)
  check(steps, 'G3 ArrowDown salta el divider y enfoca "b"', focus === rows[2].id, {
    focus,
    expected: rows[2].id
  })

  // G4 · borrar con el menú un párrafo tras divider → ¿se pierde el foco?
  await seed(page, [
    makeBlock(0, 'divider', ''),
    makeBlock(1, 'paragraph', 'x'),
    makeBlock(2, 'paragraph', 'y')
  ])
  const row = page.locator('[data-row-id]').nth(1)
  await row.hover()
  await row.locator('[data-block-handle]').click()
  await page.waitForSelector('[data-block-menu]')
  await page.click('[data-menu-action="delete"]')
  await settle(page, 250)
  rows = await dom(page)
  focus = await focusedBlock(page)
  check(
    steps,
    'G4 tras eliminar párrafo con divider delante, el foco sigue en un bloque editable',
    rows.length === 2 && focus === rows[1].id,
    { rows: rows.map((r) => `${r.type}:${r.text}`), focus }
  )

  // G5 · convertir un párrafo con texto en divider desde el menú (texto oculto)
  await seed(page, [makeBlock(0, 'paragraph', 'uno'), makeBlock(1, 'paragraph', 'dos')])
  let row0 = page.locator('[data-row-id]').nth(0)
  await row0.hover()
  await row0.locator('[data-block-handle]').click()
  await page.waitForSelector('[data-block-menu]')
  await page.click('[data-menu-action="convert"]')
  await page.click('[data-menu-action="convert-divider"]')
  await settle(page, 200)
  await advanceAutosave(page)
  let persistedG5 = await state(page)
  rows = await dom(page)
  const converted0 = persistedG5.blocks.find((b) => b.id === 'seed-0')
  focus = await focusedBlock(page)
  check(
    steps,
    'G5a convertir párrafo con texto a divider limpia el texto oculto',
    converted0.type === 'divider' && converted0.content === '{"text":""}',
    converted0
  )
  check(
    steps,
    'G5b el foco va al siguiente bloque textual tras la conversión',
    rows.length === 2 && rows[1].type === 'paragraph' && focus === rows[1].id,
    { focus, expected: rows[1].id }
  )

  // G6 · convertir el ÚLTIMO bloque a divider crea un párrafo enfocado debajo
  await seed(page, [makeBlock(0, 'paragraph', 'uno')])
  row0 = page.locator('[data-row-id]').nth(0)
  await row0.hover()
  await row0.locator('[data-block-handle]').click()
  await page.waitForSelector('[data-block-menu]')
  await page.click('[data-menu-action="convert"]')
  await page.click('[data-menu-action="convert-divider"]')
  await settle(page, 200)
  rows = await dom(page)
  focus = await focusedBlock(page)
  check(
    steps,
    'G6 convertir el último bloque a divider añade párrafo enfocado',
    rows.length === 2 && rows[0].type === 'divider' && rows[1].type === 'paragraph' && focus === rows[1].id,
    { rows: rows.map((r) => r.type), focus }
  )
  await page.keyboard.type('z')
  await settle(page, 120)
  rows = await dom(page)
  check(steps, 'G6b se puede teclear en el párrafo creado', rows[1].text === 'z', rows[1])

  // G7 · Ctrl+Z (×2: tecleo 'z' + conversión) revierte y recupera el texto
  await page.keyboard.press('Control+z')
  await settle(page, 150)
  await page.keyboard.press('Control+z')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'G7 Ctrl+Z×2 tras convertir a divider recupera "uno"',
    rows.length === 1 && rows[0].type === 'paragraph' && rows[0].text === 'uno',
    rows
  )
  return { steps }
}

// ---------------------------------------------------------------- H. saltos de línea / caret
async function stageH(page) {
  const steps = []

  // H1 · Shift+Enter en mitad del texto y tecleo posterior
  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await settle(page, 60)
  let off = await caretOffset(page)
  check(steps, 'H1a caret en offset 2 antes de Shift+Enter', off === 2, off)
  await page.keyboard.press('Shift+Enter')
  await settle(page, 80)
  let rows = await dom(page)
  check(steps, 'H1b Shift+Enter a mitad ("ab\\ncd")', rows[0].text === 'ab\ncd', rows[0])
  off = await caretOffset(page)
  check(steps, 'H1c caret tras el salto (offset 3)', off === 3, off)
  await page.keyboard.type('X')
  await settle(page, 120)
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'H1d el tecleo posterior cae entre las líneas ("ab\\nXcd")',
    rows[0].text === 'ab\nXcd' && off === 4,
    { text: rows[0].text, off }
  )
  await shot(page, 'adv-H1-shift-enter-mid.png')

  // H2 · Enter en code: mitad, final, varios saltos y al inicio
  await seed(page, [makeBlock(0, 'code', 'abcdef')])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await settle(page, 60)
  await page.keyboard.press('Enter')
  await settle(page, 80)
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'H2a Enter en code a mitad ("abc\\ndef")',
    rows[0].type === 'code' && rows[0].text === 'abc\ndef' && off === 4,
    { text: rows[0].text, off, type: rows[0].type }
  )
  await page.keyboard.type('X')
  await settle(page, 120)
  rows = await dom(page)
  check(
    steps,
    'H2b tecleo tras Enter en code va tras el salto ("abc\\nXdef")',
    rows[0].text === 'abc\nXdef',
    rows[0]
  )

  await seed(page, [makeBlock(0, 'code', 'ab')])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await settle(page, 80)
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'H2c dos Enter seguidos en code ("ab\\n\\n")',
    rows[0].text === 'ab\n\n' && off === 4,
    { text: rows[0].text, off }
  )
  await page.keyboard.type('c')
  await settle(page, 120)
  rows = await dom(page)
  check(steps, 'H2d tecleo tras dos saltos ("ab\\n\\nc")', rows[0].text === 'ab\n\nc', rows[0])

  await seed(page, [makeBlock(0, 'code', 'ab')])
  await clickEditable(page, 0, 'start')
  await page.keyboard.press('Enter')
  await settle(page, 80)
  await page.keyboard.type('X')
  await settle(page, 120)
  rows = await dom(page)
  check(steps, 'H2e Enter al inicio del code + tecleo ("\\nXab")', rows[0].text === '\nXab', rows[0])

  await seed(page, [makeBlock(0, 'paragraph', 'a')])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('b')
  await settle(page, 120)
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'H2f dos Shift+Enter seguidos en párrafo ("a\\n\\nb")',
    rows[0].text === 'a\n\nb' && off === 4,
    { text: rows[0].text, off }
  )
  await shot(page, 'adv-H2-multi-enter.png')

  // H3 · Backspace que borra un salto
  await seed(page, [makeBlock(0, 'paragraph', 'abc\ndef')])
  await placeCaret(page, 0, 4)
  await settle(page, 60)
  off = await caretOffset(page)
  check(steps, 'H3a caret colocado al inicio de la 2ª línea (offset 4)', off === 4, off)
  await page.keyboard.press('Backspace')
  await settle(page, 150)
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'H3b Backspace al inicio de la 2ª línea une ("abcdef")',
    rows[0].text === 'abcdef' && off === 3,
    { text: rows[0].text, off }
  )
  await page.keyboard.type('Z')
  await settle(page, 120)
  rows = await dom(page)
  check(steps, 'H3c se sigue tecleando en el punto de unión', rows[0].text === 'abcZdef', rows[0])

  await seed(page, [makeBlock(0, 'paragraph', 'ab\ncd')])
  await placeCaret(page, 0, 4)
  await settle(page, 60)
  await page.keyboard.press('Backspace')
  await settle(page, 120)
  rows = await dom(page)
  check(
    steps,
    'H3d Backspace a mitad de la 2ª línea borra el carácter previo ("ab\\nd")',
    rows[0].text === 'ab\nd',
    rows[0]
  )
  await shot(page, 'adv-H3-backspace-newline.png')

  // H4 · flechas y borrado en bloque multilínea
  await seed(page, [makeBlock(0, 'paragraph', 'a\nb\nc'), makeBlock(1, 'paragraph', 'd')])
  await placeCaret(page, 0, 0)
  await settle(page, 60)
  off = await caretOffset(page)
  check(steps, 'H4a0 placeCaret deja el caret en offset 0', off === 0, off)
  await page.keyboard.press('ArrowDown')
  await settle(page, 80)
  off = await caretOffset(page)
  let focus = await focusedBlock(page)
  rows = await dom(page)
  check(
    steps,
    'H4a ArrowDown dentro del bloque baja de línea (offset 2) sin salir',
    focus === rows[0].id && off === 2,
    { focus, off, expected: rows[0].id }
  )
  await page.keyboard.press('ArrowDown')
  await settle(page, 80)
  off = await caretOffset(page)
  check(steps, 'H4b segundo ArrowDown llega a la línea "c" (offset 4)', off === 4, off)
  await page.keyboard.press('End')
  await settle(page, 60)
  off = await caretOffset(page)
  check(steps, 'H4c End en la última línea (offset 5)', off === 5, off)
  await page.keyboard.press('ArrowDown')
  await settle(page, 120)
  focus = await focusedBlock(page)
  check(steps, 'H4d ArrowDown en el borde final salta al bloque siguiente', focus === 'seed-1', focus)
  await page.keyboard.press('ArrowUp')
  await settle(page, 120)
  focus = await focusedBlock(page)
  off = await caretOffset(page)
  check(
    steps,
    'H4e ArrowUp en el borde inicial vuelve al bloque anterior al final',
    focus === 'seed-0' && off === 5,
    { focus, off }
  )
  await shot(page, 'adv-H4-arrows-multiline.png')

  // H5 · undo/redo tras un salto (coalescido y sin coalescer)
  await seed(page, [makeBlock(0, 'paragraph', 'abc')])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('x')
  await settle(page, 120)
  await page.keyboard.press('Control+z')
  await settle(page, 150)
  rows = await dom(page)
  check(steps, 'H5a Ctrl+Z (coalescido) tras salto+tecleo vuelve a "abc"', rows[0].text === 'abc', rows[0])
  await page.keyboard.press('Control+Shift+z')
  await settle(page, 150)
  rows = await dom(page)
  check(steps, 'H5b Ctrl+Shift+Z restaura "abc\\nx"', rows[0].text === 'abc\nx', rows[0])

  await page.keyboard.press('Shift+Enter')
  await page.waitForTimeout(700)
  await page.keyboard.type('y')
  await settle(page, 120)
  await page.keyboard.press('Control+z')
  await settle(page, 150)
  rows = await dom(page)
  const afterUndo1 = rows[0].text
  await page.keyboard.press('Control+z')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'H5c sin coalescencia: 1er undo quita "y", 2º quita el salto',
    afterUndo1 === 'abc\nx\n' && rows[0].text === 'abc\nx',
    { afterUndo1, final: rows[0].text }
  )
  await page.keyboard.press('Control+Shift+z')
  await page.keyboard.press('Control+Shift+z')
  await settle(page, 180)
  rows = await dom(page)
  check(steps, 'H5d dos redo restauran "abc\\nx\\ny"', rows[0].text === 'abc\nx\ny', rows[0])

  // H6 · reglas markdown no se disparan tras un salto
  await seed(page, [makeBlock(0, 'paragraph', 'hola')])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('# ')
  await settle(page, 120)
  rows = await dom(page)
  check(
    steps,
    'H6a "# " en la 2ª línea NO convierte a heading ("hola\\n# ")',
    rows[0].type === 'paragraph' && rows[0].text === 'hola\n# ',
    rows[0]
  )
  await page.keyboard.type('- ')
  await settle(page, 120)
  rows = await dom(page)
  check(
    steps,
    'H6b "- " en la 2ª línea NO convierte a bullet ("hola\\n# - ")',
    rows[0].type === 'paragraph' && rows[0].text === 'hola\n# - ',
    rows[0]
  )

  // H7 · slash menu con bloques multilínea
  await seed(page, [makeBlock(0, 'paragraph', 'a\nb')])
  await placeCaret(page, 0, 3)
  await settle(page, 60)
  await openSlash(page)
  await page.keyboard.type('cita')
  await closeMenu(page)
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'H7a Escape del slash en bloque multilínea reinserta en el caret ("a\\nb/cita")',
    rows[0].text === 'a\nb/cita' && off === 8,
    { text: rows[0].text, off }
  )

  await seed(page, [makeBlock(0, 'code', 'a\nb')])
  await placeCaret(page, 0, 3)
  await settle(page, 60)
  await openSlash(page)
  await page.keyboard.type('divisor')
  await page.keyboard.press('Enter')
  await settle(page, 200)
  rows = await dom(page)
  focus = await focusedBlock(page)
  check(
    steps,
    'H7b "/divisor" con code multilínea conserva el texto e inserta divider + párrafo',
    rows.length === 3 &&
      rows[0].type === 'code' &&
      rows[0].text === 'a\nb' &&
      rows[1].type === 'divider' &&
      rows[2].type === 'paragraph' &&
      focus === rows[2].id,
    { rows: rows.map((r) => `${r.type}:${JSON.stringify(r.text)}`), focus }
  )

  // H8 · pegar multilínea (en medio, sobre selección) y undo
  await seed(page, [makeBlock(0, 'paragraph', 'ab')])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('ArrowLeft')
  await settle(page, 60)
  await pasteText(page, '1\n2')
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'H8a pegar "1\\n2" en medio de "ab" → "a1\\n2b"',
    rows[0].text === 'a1\n2b' && off === 4,
    { text: rows[0].text, off }
  )
  await page.keyboard.type('X')
  await settle(page, 120)
  rows = await dom(page)
  check(steps, 'H8b tecleo tras pegar en posición ("a1\\n2Xb")', rows[0].text === 'a1\n2Xb', rows[0])
  await page.keyboard.press('Control+z')
  await settle(page, 150)
  rows = await dom(page)
  check(steps, 'H8c Ctrl+Z tras pegar vuelve a "ab"', rows[0].text === 'ab', rows[0])
  await shot(page, 'adv-H8-paste-multiline.png')

  // H8d · teclear sobre una selección (control nativo) vs pegar (camino custom)
  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await placeCaret(page, 0, 0)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await settle(page, 60)
  const selectionBefore = await page.evaluate(() => {
    const sel = window.getSelection()
    return sel && sel.rangeCount > 0
      ? { collapsed: sel.isCollapsed, start: sel.getRangeAt(0).startOffset, end: sel.getRangeAt(0).endOffset }
      : null
  })
  await page.keyboard.type('X')
  await settle(page, 120)
  rows = await dom(page)
  check(
    steps,
    'H8d0 teclear sobre una selección sí la reemplaza ("aXd")',
    rows[0].text === 'aXd',
    { got: rows[0].text, expected: 'aXd', selectionBefore }
  )

  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await placeCaret(page, 0, 0)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await settle(page, 60)
  const selPaste = await selectionInfo(page)
  await pasteText(page, 'X')
  rows = await dom(page)
  check(
    steps,
    'H8d pegar sobre una selección reemplaza lo seleccionado ("aXd")',
    rows[0].text === 'aXd',
    { got: rows[0].text, expected: 'aXd', selection: selPaste }
  )

  // H8e · Enter en code con una selección debe reemplazarla
  await seed(page, [makeBlock(0, 'code', 'abcd')])
  await clickEditable(page, 0, 'start')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await settle(page, 60)
  const selCodeEnter = await selectionInfo(page)
  await page.keyboard.press('Enter')
  await settle(page, 120)
  rows = await dom(page)
  check(
    steps,
    'H8e Enter en code sobre selección reemplaza lo seleccionado ("a\\nd")',
    rows[0].text === 'a\nd',
    { got: rows[0].text, expected: 'a\nd', selection: selCodeEnter }
  )

  // H8e2 · Shift+Enter en párrafo sobre una selección debe reemplazarla
  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await placeCaret(page, 0, 0)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await settle(page, 60)
  const selShiftEnter = await selectionInfo(page)
  await page.keyboard.press('Shift+Enter')
  await settle(page, 120)
  rows = await dom(page)
  check(
    steps,
    'H8e2 Shift+Enter en párrafo sobre selección reemplaza lo seleccionado ("a\\nd")',
    rows[0].text === 'a\nd',
    { got: rows[0].text, expected: 'a\nd', selection: selShiftEnter }
  )

  // H8f · Enter en párrafo con una selección debe reemplazarla
  await seed(page, [makeBlock(0, 'paragraph', 'abcd')])
  await clickEditable(page, 0, 'start')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await settle(page, 60)
  const selParagraphEnter = await selectionInfo(page)
  await page.keyboard.press('Enter')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'H8f Enter en párrafo sobre selección parte como "a" + "d"',
    rows.length === 2 && rows[0].text === 'a' && rows[1].text === 'd',
    { got: rows.map((r) => r.text), expected: ['a', 'd'], selection: selParagraphEnter }
  )

  // H9 · Delete/Backspace fusionando bloques multilínea
  await seed(page, [makeBlock(0, 'paragraph', 'a\nb'), makeBlock(1, 'paragraph', 'c')])
  await placeCaret(page, 0, 3)
  await settle(page, 60)
  await page.keyboard.press('Delete')
  await settle(page, 150)
  rows = await dom(page)
  off = await caretOffset(page)
  check(
    steps,
    'H9a Delete al final de multilínea fusiona ("a\\nbc")',
    rows.length === 1 && rows[0].text === 'a\nbc' && off === 3,
    { rows: rows.map((r) => r.text), off }
  )

  await seed(page, [makeBlock(0, 'paragraph', 'x'), makeBlock(1, 'paragraph', 'a\nb')])
  await placeCaret(page, 1, 0)
  await settle(page, 60)
  await page.keyboard.press('Backspace')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'H9b Backspace al inicio de "a\\nb" tras "x" → "xa\\nb"',
    rows.length === 1 && rows[0].text === 'xa\nb',
    rows
  )

  // H10 · persistencia de saltos tras autosave + reload
  await seed(page, [makeBlock(0, 'paragraph', ''), makeBlock(1, 'code', '')])
  await clickEditable(page, 0)
  await page.keyboard.type('a')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('b')
  await clickEditable(page, 1)
  await page.keyboard.type('x')
  await page.keyboard.press('Enter')
  await page.keyboard.type('y')
  await advanceAutosave(page)
  const persisted = await state(page)
  check(
    steps,
    'H10a autosave persiste los saltos ("a\\nb" y "x\\ny")',
    persisted.blocks[0].content === JSON.stringify({ text: 'a\nb' }) &&
      persisted.blocks[1].content === JSON.stringify({ text: 'x\ny' }),
    persisted.blocks.map((b) => b.content)
  )
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 300)
  rows = await dom(page)
  check(
    steps,
    'H10b los saltos sobreviven al reload',
    rows[0].text === 'a\nb' && rows[1].text === 'x\ny',
    rows.map((r) => [r.type, r.text])
  )

  // H11 · Ctrl+D sobre un bloque multilínea
  await seed(page, [makeBlock(0, 'paragraph', 'a\nb')])
  await clickEditable(page, 0, 'end')
  await page.keyboard.press('Control+d')
  await settle(page, 150)
  rows = await dom(page)
  check(
    steps,
    'H11a Ctrl+D duplica un bloque multilínea conservando saltos',
    rows.length === 2 && rows.every((r) => r.text === 'a\nb'),
    rows.map((r) => r.text)
  )
  check(steps, 'H11b la copia queda seleccionada', rows[1].selected === true, rows.map((r) => r.selected))
  return { steps }
}

// ---------------------------------------------------------------- I. divider y borrados (2ª ronda)
async function stageI(page) {
  const steps = []

  // I1 · Backspace en la 2ª línea tras un divider: une líneas, NO borra el divider
  await seed(page, [makeBlock(0, 'divider', ''), makeBlock(1, 'paragraph', 'a\nb')])
  await placeCaret(page, 1, 2)
  await settle(page, 60)
  let off = await caretOffset(page)
  check(steps, 'I1a caret al inicio de la 2ª línea (offset 2)', off === 2, off)
  await page.keyboard.press('Backspace')
  await settle(page, 150)
  let rows = await dom(page)
  let focus = await focusedBlock(page)
  check(
    steps,
    'I1b Backspace en 2ª línea NO elimina el divider ("a\\nb" → "ab")',
    rows.length === 2 &&
      rows[0].type === 'divider' &&
      rows[1].text === 'ab' &&
      focus === rows[1].id,
    { rows: rows.map((r) => `${r.type}:${JSON.stringify(r.text)}`), focus }
  )

  // I2 · en offset 0 sí elimina el divider conservando el texto multilínea
  await seed(page, [makeBlock(0, 'divider', ''), makeBlock(1, 'paragraph', 'a\nb')])
  await placeCaret(page, 1, 0)
  await settle(page, 60)
  await page.keyboard.press('Backspace')
  await settle(page, 150)
  rows = await dom(page)
  focus = await focusedBlock(page)
  check(
    steps,
    'I2a Backspace en offset 0 tras divider elimina el divider y conserva "a\\nb"',
    rows.length === 1 && rows[0].type === 'paragraph' && rows[0].text === 'a\nb' && focus === rows[0].id,
    { rows: rows.map((r) => `${r.type}:${JSON.stringify(r.text)}`), focus }
  )

  await seed(page, [makeBlock(0, 'paragraph', 'a\nb'), makeBlock(1, 'divider', '')])
  await placeCaret(page, 0, 3)
  await settle(page, 60)
  await page.keyboard.press('Delete')
  await settle(page, 150)
  rows = await dom(page)
  focus = await focusedBlock(page)
  check(
    steps,
    'I2b Delete al final de multilínea elimina el divider siguiente',
    rows.length === 1 && rows[0].type === 'paragraph' && rows[0].text === 'a\nb' && focus === rows[0].id,
    { rows: rows.map((r) => `${r.type}:${JSON.stringify(r.text)}`), focus }
  )

  // I3 · flechas saltando varios dividers consecutivos
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'divider', ''),
    makeBlock(2, 'divider', ''),
    makeBlock(3, 'paragraph', 'b')
  ])
  await clickEditable(page, 3, 'start')
  await page.keyboard.press('ArrowUp')
  await settle(page, 120)
  focus = await focusedBlock(page)
  check(steps, 'I3a ArrowUp salta 2 dividers consecutivos', focus === 'seed-0', focus)
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowDown')
  await settle(page, 120)
  focus = await focusedBlock(page)
  check(steps, 'I3b ArrowDown salta 2 dividers consecutivos', focus === 'seed-3', focus)

  // I4 · menú: eliminar el único divider → párrafo nuevo enfocado
  await seed(page, [makeBlock(0, 'divider', '')])
  let row = page.locator('[data-row-id]').nth(0)
  await row.hover()
  await row.locator('[data-block-handle]').click()
  await page.waitForSelector('[data-block-menu]')
  await page.click('[data-menu-action="delete"]')
  await settle(page, 200)
  rows = await dom(page)
  focus = await focusedBlock(page)
  check(
    steps,
    'I4a borrar el único divider deja un párrafo enfocado (no BODY)',
    rows.length === 1 && rows[0].type === 'paragraph' && focus === rows[0].id,
    { rows: rows.map((r) => r.type), focus, active: await activeTag(page) }
  )
  await page.keyboard.type('ok')
  await settle(page, 120)
  rows = await dom(page)
  check(steps, 'I4b se puede teclear en el párrafo creado', rows[0].text === 'ok', rows[0])

  // I5 · menú: eliminar el único textual junto a un divider → párrafo nuevo enfocado
  await seed(page, [makeBlock(0, 'paragraph', 'x'), makeBlock(1, 'divider', '')])
  row = page.locator('[data-row-id]').nth(0)
  await row.hover()
  await row.locator('[data-block-handle]').click()
  await page.waitForSelector('[data-block-menu]')
  await page.click('[data-menu-action="delete"]')
  await settle(page, 220)
  rows = await dom(page)
  focus = await focusedBlock(page)
  check(
    steps,
    'I5 borrar el único textual junto a divider deja párrafo enfocado',
    rows.length === 2 && rows[0].type === 'divider' && rows[1].type === 'paragraph' && focus === rows[1].id,
    { rows: rows.map((r) => r.type), focus, active: await activeTag(page) }
  )

  // I6 · selección párrafo+divider: borrar deja foco textual
  await seed(page, [
    makeBlock(0, 'paragraph', 'a'),
    makeBlock(1, 'divider', ''),
    makeBlock(2, 'paragraph', 'b')
  ])
  await clickEditable(page, 0)
  await page.locator('[data-row-id]').nth(1).click({ modifiers: ['Shift'] })
  await settle(page)
  await page.keyboard.press('Backspace')
  await settle(page, 200)
  rows = await dom(page)
  focus = await focusedBlock(page)
  check(
    steps,
    'I6 borrar selección párrafo+divider deja "b" con foco',
    rows.length === 1 && rows[0].text === 'b' && focus === 'seed-2',
    { rows: rows.map((r) => `${r.type}:${r.text}`), focus }
  )

  // I7 · menú: eliminar el último textual tras divider → párrafo enfocado al final
  await seed(page, [makeBlock(0, 'divider', ''), makeBlock(1, 'paragraph', 'x')])
  row = page.locator('[data-row-id]').nth(1)
  await row.hover()
  await row.locator('[data-block-handle]').click()
  await page.waitForSelector('[data-block-menu]')
  await page.click('[data-menu-action="delete"]')
  await settle(page, 220)
  rows = await dom(page)
  focus = await focusedBlock(page)
  check(
    steps,
    'I7 borrar el último textual tras divider crea párrafo enfocado al final',
    rows.length === 2 && rows[0].type === 'divider' && rows[1].type === 'paragraph' && focus === rows[1].id,
    { rows: rows.map((r) => r.type), focus, active: await activeTag(page) }
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
    ['A · markdown límites', stageA],
    ['B · slash menu límites', stageB],
    ['C · checkbox', stageC],
    ['D · drag & drop', stageD],
    ['E · multi-selección', stageE],
    ['F · persistencia/content', stageF],
    ['G · integración divider', stageG],
    ['H · saltos de línea y caret', stageH],
    ['I · divider y borrados (2ª ronda)', stageI]
  ]
  for (const [name, fn] of stages) {
    try {
      const result = await fn(page)
      report.stages.push({ name, steps: result.steps })
    } catch (error) {
      report.stages.push({ name, fatal: String(error && error.stack ? error.stack : error) })
      try {
        await shot(page, `adv-fatal-${name.split(' ')[0]}.png`)
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
    path.join(OUT, 'e2e-phase4-adversarial-report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report.summary, null, 2))
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
