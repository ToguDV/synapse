// Runner E2E de la Fase 3 (núcleo del editor) con Playwright + Chromium empaquetado.
// El MCP de Playwright sí es usable en esta máquina (wrapper con Chromium bundled),
// pero se prefieren runners propios: son deterministas y no dependen de una sesión interactiva.
//
// Uso (desde el host, con el dev server del renderer en 5174):
//   node e2e/phase3.e2e.cjs
const { chromium } = require('/home/togu/.npm/_npx/86170c4cd1c5da32/node_modules/playwright')
const path = require('node:path')
const fs = require('node:fs')

const URL = 'http://localhost:5174/'
const MOCK = path.join(__dirname, 'mock-api.js')
const OUT = '/tmp/opencode'
fs.mkdirSync(OUT, { recursive: true })

const consoleErrors = []
const report = { stages: [], consoleErrors }

const check = (steps, name, ok, detail) => steps.push({ name, ok: !!ok, detail })

const dom = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('div[contenteditable]')].map((el) => {
      let row = el.parentElement
      while (row && !row.style.marginLeft) row = row.parentElement
      return {
        id: el.getAttribute('data-block-id'),
        text: el.textContent,
        marginLeft: row ? row.style.marginLeft : null
      }
    })
  )

const activeId = (page) =>
  page.evaluate(() => document.activeElement?.getAttribute?.('data-block-id') ?? null)

const caretOffset = (page) =>
  page.evaluate(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    const el = document.activeElement
    if (!el || !el.contains(range.startContainer)) return null
    const prefix = range.cloneRange()
    prefix.selectNodeContents(el)
    prefix.setEnd(range.startContainer, range.startOffset)
    return prefix.toString().length
  })

const state = (page) => page.evaluate(() => window.__mockState())
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })

async function setup(page) {
  await page.goto(URL)
  await page.waitForSelector('div[contenteditable]')
  await page.evaluate(() => window.__mockReset())
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await page.waitForTimeout(250)
}

async function splitInMiddle(page, text = 'hola mundo', offset = 5) {
  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.type(text)
  await page.keyboard.press('End')
  for (let i = 0; i < offset; i += 1) await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelectorAll('div[contenteditable]').length === 2)
  await page.waitForTimeout(120)
}

async function stage1(page) {
  const steps = []
  await setup(page)

  const title = await page.locator('input').first().inputValue()
  check(steps, 'título de la página es "Test"', title === 'Test', title)

  let blocks = await dom(page)
  check(steps, 'un bloque contenteditable inicial vacío', blocks.length === 1 && blocks[0].text === '', blocks)
  await shot(page, 'e2e-01-inicial.png')

  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.type('hola mundo')
  blocks = await dom(page)
  check(steps, 'escritura "hola mundo"', blocks[0]?.text === 'hola mundo', blocks)

  await page.keyboard.press('End')
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowLeft')
  const caretBefore = await caretOffset(page)
  check(steps, 'caret en offset 5 antes de Enter', caretBefore === 5, caretBefore)

  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelectorAll('div[contenteditable]').length === 2)
  await page.waitForTimeout(120)
  blocks = await dom(page)
  check(
    steps,
    'Enter parte en "hola " + "mundo"',
    blocks.length === 2 && blocks[0].text === 'hola ' && blocks[1].text === 'mundo',
    blocks
  )
  const activeSplit = await activeId(page)
  const caretSplit = await caretOffset(page)
  check(steps, 'el caret queda en el bloque nuevo', activeSplit === blocks[1]?.id, {
    activeSplit,
    newId: blocks[1]?.id
  })
  check(steps, 'caret del bloque nuevo en 0', caretSplit === 0, caretSplit)
  await shot(page, 'e2e-02-split.png')

  // Dejar que el autosave del split llegue y persistir el bloque intermedio,
  // para poder verificar después el remove al fusionar.
  await page.waitForTimeout(700)
  const afterSplit = await state(page)
  const splitCreate = afterSplit.calls.find(
    (call) => call[0] === 'create' && call[1].content === '{"text":"mundo"}'
  )
  check(
    steps,
    'autosave del split: create "mundo" en position 1',
    splitCreate && splitCreate[1].position === 1 && splitCreate[1].id === blocks[1]?.id,
    splitCreate && splitCreate[1]
  )

  await page.locator('div[contenteditable]').nth(1).click()
  await page.keyboard.press('Home')
  check(steps, 'caret al inicio del segundo bloque', (await caretOffset(page)) === 0, await caretOffset(page))

  await page.keyboard.press('Backspace')
  await page.waitForFunction(() => document.querySelectorAll('div[contenteditable]').length === 1)
  await page.waitForTimeout(120)
  blocks = await dom(page)
  const activeMerge = await activeId(page)
  const caretMerge = await caretOffset(page)
  check(steps, 'Backspace fusiona en "hola mundo"', blocks.length === 1 && blocks[0].text === 'hola mundo', blocks)
  // El caret queda en la unión de ambos textos (5), igual que en mergeWithPrevious.
  check(steps, 'caret en la unión del bloque fusionado (offset 5)', activeMerge === blocks[0]?.id && caretMerge === 5, {
    activeMerge,
    caretMerge
  })
  await shot(page, 'e2e-03-merge.png')

  await page.waitForTimeout(700)
  const persisted = await state(page)
  const kinds = persisted.calls.map((call) => call[0])
  const removeCall = persisted.calls.find((call) => call[0] === 'remove')
  check(steps, 'autosave: remove del bloque fusionado', !!removeCall, kinds)
  const lastUpdate = [...persisted.calls].reverse().find((call) => call[0] === 'update')
  check(
    steps,
    'autosave: update del primer bloque a "hola mundo"',
    lastUpdate && JSON.parse(lastUpdate[2].content).text === 'hola mundo',
    lastUpdate
  )
  const text = persisted.blocks[0] ? JSON.parse(persisted.blocks[0].content).text : null
  check(steps, 'BD mock: un bloque "hola mundo"', persisted.blocks.length === 1 && text === 'hola mundo', persisted.blocks)

  return { steps, calls: persisted.calls }
}

async function stage2a(page) {
  const steps = []
  await setup(page)

  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.insertText('canción ñandú')
  const blocks = await dom(page)
  check(steps, 'insertText conserva acentos y ñ', blocks[0]?.text === 'canción ñandú', blocks)

  await page.waitForTimeout(700)
  const persisted = await state(page)
  const updateCall = persisted.calls.find((call) => call[0] === 'update')
  const savedText = updateCall ? JSON.parse(updateCall[2].content).text : null
  check(steps, 'autosave guarda el texto acentuado', savedText === 'canción ñandú', updateCall && updateCall[2])
  await shot(page, 'e2e-04-acentos.png')

  return { steps, calls: persisted.calls }
}

async function stage2b(page) {
  const steps = []
  await setup(page)
  await splitInMiddle(page)

  let blocks = await dom(page)
  check(steps, 'split previo para Tab', blocks.length === 2 && blocks[1].text === 'mundo', blocks)

  await page.keyboard.press('Tab')
  await page.waitForTimeout(150)
  blocks = await dom(page)
  const secondId = blocks[1]?.id
  check(steps, 'Tab indenta el segundo bloque (marginLeft 24px)', blocks[1]?.marginLeft === '24px', blocks)
  await page.waitForTimeout(700)
  let persisted = await state(page)
  // Si el split aún no se había persistido, el bloque se crea ya con indent 1;
  // si ya existía, se actualiza. Ambas rutas son válidas.
  const persistedIndent1 = persisted.calls.some(
    (call) =>
      (call[0] === 'update' && call[1] === secondId && call[2].indent === 1) ||
      (call[0] === 'create' && call[1].id === secondId && call[1].indent === 1)
  )
  check(steps, 'autosave registra indent 1', persistedIndent1, persisted.calls)
  await shot(page, 'e2e-05-indent.png')

  await page.keyboard.press('Shift+Tab')
  await page.waitForTimeout(150)
  blocks = await dom(page)
  check(steps, 'Shift+Tab devuelve a 0', blocks[1]?.marginLeft === '0px', blocks)
  await page.waitForTimeout(700)
  persisted = await state(page)
  check(
    steps,
    'autosave registra indent 0',
    persisted.calls.some((call) => call[0] === 'update' && call[1] === secondId && call[2].indent === 0),
    persisted.calls
  )

  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  blocks = await dom(page)
  check(steps, 'Ctrl+Z deshace el outdent (vuelve a 24px)', blocks[1]?.marginLeft === '24px', blocks)
  await page.waitForTimeout(700)
  persisted = await state(page)
  check(
    steps,
    'autosave tras undo registra indent 1',
    persisted.calls.some((call) => call[0] === 'update' && call[1] === secondId && call[2].indent === 1),
    persisted.calls
  )

  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(200)
  blocks = await dom(page)
  check(steps, 'Ctrl+Shift+Z rehace el outdent (vuelve a 0)', blocks[1]?.marginLeft === '0px', blocks)
  check(steps, 'el texto sobrevive a undo/redo', blocks[1]?.text === 'mundo', blocks)
  await shot(page, 'e2e-06-undo-redo.png')

  return { steps, calls: persisted.calls }
}

async function stage3(page) {
  const steps = []
  await setup(page)
  await splitInMiddle(page)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(900)

  let persisted = await state(page)
  const texts = persisted.blocks.map((block) => JSON.parse(block.content).text)
  check(steps, 'BD mock: dos bloques "hola " + "mundo"', persisted.blocks.length === 2 && texts[0] === 'hola ' && texts[1] === 'mundo', persisted.blocks)
  check(
    steps,
    'BD mock: indent 1 en el segundo',
    persisted.blocks[1]?.indent === 1 && persisted.blocks[1]?.position === 1,
    persisted.blocks
  )
  const kinds = persisted.calls.map((call) => call[0])
  check(steps, 'secuencia de autosave create+update coherente', kinds.includes('create') && kinds.includes('update'), persisted.calls)
  await shot(page, 'e2e-07-autosave.png')

  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await page.waitForTimeout(300)
  const blocks = await dom(page)
  const title = await page.locator('input').first().inputValue()
  check(steps, 'reload reconstruye los dos bloques', blocks.length === 2, blocks)
  check(steps, 'reload conserva "hola "', blocks[0]?.text === 'hola ', blocks)
  check(steps, 'reload conserva "mundo"', blocks[1]?.text === 'mundo', blocks)
  check(steps, 'reload conserva indent 1 (marginLeft 24px)', blocks[1]?.marginLeft === '24px', blocks)
  check(steps, 'reload conserva el título "Test"', title === 'Test', title)
  await shot(page, 'e2e-08-reload.png')

  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
  const activeDown = await activeId(page)
  const caretDown = await caretOffset(page)
  check(steps, 'ArrowDown baja al segundo bloque (caret 0)', activeDown === blocks[1]?.id && caretDown === 0, {
    activeDown,
    caretDown
  })

  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(150)
  const activeUp = await activeId(page)
  const caretUp = await caretOffset(page)
  check(steps, 'ArrowUp sube al primer bloque (caret final)', activeUp === blocks[0]?.id && caretUp === 5, {
    activeUp,
    caretUp
  })

  return { steps, calls: persisted.calls }
}

async function stage4(page) {
  const steps = []
  await setup(page)

  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.type('uno')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelectorAll('div[contenteditable]').length === 2)
  await page.keyboard.type('dos')
  await page.waitForTimeout(120)
  let blocks = await dom(page)
  check(steps, 'dos bloques "uno" + "dos"', blocks.length === 2 && blocks[0].text === 'uno' && blocks[1].text === 'dos', blocks)

  // Backspace al inicio del PRIMER bloque no debe hacer nada.
  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(150)
  blocks = await dom(page)
  check(steps, 'Backspace en el primer bloque es no-op', blocks.length === 2 && blocks[0].text === 'uno', blocks)

  // Delete al final del primer bloque fusiona hacia delante.
  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Delete')
  await page.waitForFunction(() => document.querySelectorAll('div[contenteditable]').length === 1)
  await page.waitForTimeout(120)
  blocks = await dom(page)
  const activeMerge = await activeId(page)
  const caretMerge = await caretOffset(page)
  check(steps, 'Delete fusiona hacia delante en "unodos"', blocks.length === 1 && blocks[0].text === 'unodos', blocks)
  check(steps, 'caret en la unión (offset 3)', activeMerge === blocks[0]?.id && caretMerge === 3, { activeMerge, caretMerge })
  await shot(page, 'e2e-09-delete-forward.png')

  await page.keyboard.press('Control+z')
  await page.waitForTimeout(150)
  blocks = await dom(page)
  check(steps, 'Ctrl+Z deshace la fusión', blocks.length === 2 && blocks[0].text === 'uno' && blocks[1].text === 'dos', blocks)

  await page.keyboard.press('Control+y')
  await page.waitForTimeout(150)
  blocks = await dom(page)
  check(steps, 'Ctrl+Y rehace la fusión', blocks.length === 1 && blocks[0].text === 'unodos', blocks)

  await page.waitForTimeout(700)
  const persisted = await state(page)
  check(steps, 'BD mock: un bloque "unodos"', persisted.blocks.length === 1, persisted.blocks)

  return { steps, calls: persisted.calls }
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
    ['stage1 · carga/tecleo/split/merge/autosave', stage1],
    ['stage2a · acentos', stage2a],
    ['stage2b · Tab/Shift+Tab/undo/redo', stage2b],
    ['stage3 · autosave + reload + flechas', stage3],
    ['stage4 · bordes: Backspace primer bloque, Delete, Ctrl+Y', stage4]
  ]
  for (const [name, fn] of stages) {
    try {
      const result = await fn(page)
      report.stages.push({ name, steps: result.steps, calls: result.calls })
    } catch (error) {
      report.stages.push({ name, fatal: String(error && error.stack ? error.stack : error) })
    }
  }

  await browser.close()
  const failures = report.stages.flatMap((stage) => (stage.steps ?? []).filter((step) => !step.ok).map((step) => `${stage.name}: ${step.name}`))
  report.summary = {
    totalChecks: report.stages.flatMap((stage) => stage.steps ?? []).length,
    failedChecks: failures,
    consoleErrors
  }
  fs.writeFileSync(path.join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.summary, null, 2))
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
