// Runner E2E de la interfaz móvil (viewport estrecho + táctil) con Playwright.
// Contexto Chromium con `hasTouch` (sin `isMobile`, que activaría el layout viewport
// de 980px) y emulación de long-press con PointerEvents sintéticos.
//
// Uso (desde el host, con el dev server del renderer en 5174):
//   node e2e/mobile.e2e.cjs
const { chromium } = require('/home/togu/.npm/_npx/86170c4cd1c5da32/node_modules/playwright')
const path = require('node:path')
const fs = require('node:fs')

const URL = 'http://localhost:5174/'
const MOCK = path.join(__dirname, 'mock-api.js')
const OUT = '/tmp/opencode'
fs.mkdirSync(OUT, { recursive: true })

const VIEWPORT = { width: 390, height: 844 }

const SEED = {
  pages: [
    {
      id: 'p1',
      title: 'Mobile check',
      parentId: null,
      icon: '🚀',
      position: 0,
      createdAt: 1,
      updatedAt: 1
    },
    {
      id: 'p2',
      title: 'Child page',
      parentId: 'p1',
      icon: null,
      position: 0,
      createdAt: 2,
      updatedAt: 2
    },
    {
      id: 'p3',
      title: 'Other root',
      parentId: null,
      icon: null,
      position: 1,
      createdAt: 3,
      updatedAt: 3
    }
  ],
  blocks: [
    {
      id: 'k1',
      pageId: 'p1',
      type: 'heading',
      content: JSON.stringify({ text: 'Hola móvil' }),
      position: 0,
      indent: 0,
      createdAt: 1,
      updatedAt: 1
    },
    {
      id: 'k2',
      pageId: 'p1',
      type: 'paragraph',
      content: JSON.stringify({ text: 'Un párrafo de prueba para el layout estrecho.' }),
      position: 1,
      indent: 0,
      createdAt: 2,
      updatedAt: 2
    },
    {
      id: 'k3',
      pageId: 'p1',
      type: 'todo',
      content: JSON.stringify({ text: 'Tarea con estado', status: 'todo' }),
      position: 2,
      indent: 0,
      createdAt: 3,
      updatedAt: 3
    },
    {
      id: 'k4',
      pageId: 'p1',
      type: 'bullet',
      content: JSON.stringify({ text: 'Elemento de lista' }),
      position: 3,
      indent: 0,
      createdAt: 4,
      updatedAt: 4
    },
    {
      id: 'k5',
      pageId: 'p1',
      type: 'code',
      content: JSON.stringify({ text: 'const a = 1' }),
      position: 4,
      indent: 0,
      createdAt: 5,
      updatedAt: 5
    },
    {
      id: 'k6',
      pageId: 'p1',
      type: 'paragraph',
      content: JSON.stringify({ text: '' }),
      position: 5,
      indent: 0,
      createdAt: 6,
      updatedAt: 6
    }
  ],
  settings: {}
}

const consoleErrors = []
const report = { stages: [], errors: [], consoleErrors }

const check = (steps, name, ok, detail) => steps.push({ name, ok: !!ok, detail: detail ?? null })

const state = (page) => page.evaluate(() => window.__mockState())

const boxOf = (page, selector) => page.locator(selector).boundingBox()



const sheetNames = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-sheet]')].map((el) => el.dataset.sheet))

const sidebarX = (page) =>
  page.evaluate(() => Math.round(document.querySelector('[data-sidebar]').getBoundingClientRect().x))

async function setup(page) {
  await page.addInitScript({ path: MOCK })
  await page.goto(URL)
  await page.evaluate((seed) => {
    localStorage.setItem('__synapse_e2e_mock__', JSON.stringify(seed))
  }, SEED)
  await page.reload()
  await page.waitForSelector('[data-block-id]')
  await page.waitForTimeout(300)
}

async function dispatchOn(page, selector, type, x, y) {
  await page.evaluate(
    ({ selector, type, x, y }) => {
      document.querySelector(selector).dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 11,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1
        })
      )
    },
    { selector, type, x, y }
  )
}

async function dispatchWindow(page, type, x, y) {
  await page.evaluate(
    ({ type, x, y }) => {
      window.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 11,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1
        })
      )
    },
    { type, x, y }
  )
}

/* Long-press táctil completo (down + espera real > LONG_PRESS_MS + up).
   Los menús por long-press sin arrastre se abren al soltar. */
async function longPress(page, selector, offset = { x: 0, y: 0 }) {
  const box = await boxOf(page, selector)
  const x = box.x + box.width / 2 + offset.x
  const y = box.y + box.height / 2 + offset.y
  await dispatchOn(page, selector, 'pointerdown', x, y)
  await page.waitForTimeout(650)
  await dispatchWindow(page, 'pointerup', x, y)
  await page.waitForTimeout(250)
  return { x, y }
}

async function openDrawer(page) {
  if ((await sidebarX(page)) < 0) {
    await page.tap('[data-sidebar-toggle]')
    await page.waitForTimeout(250)
  }
}

async function closeDrawer(page) {
  if ((await sidebarX(page)) >= 0) {
    await page.tap('[data-sidebar-close]')
    await page.waitForTimeout(250)
  }
}

async function dismissSheets(page) {
  if ((await sheetNames(page)).length > 0) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
}

async function runStage(name, body) {
  const steps = []
  try {
    await body(steps)
  } catch (err) {
    report.errors.push(`${name}: ${err.message}`)
  }
  report.stages.push({ name, checks: steps })
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: VIEWPORT,
    hasTouch: true,
    deviceScaleFactor: 2
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(String(err.message ?? err)))
  page.on('crash', () => consoleErrors.push('page crashed'))

  await setup(page)

  // --- A) Layout estrecho -------------------------------------------------
  await runStage('A · layout estrecho', async (steps) => {
    const sidebar = await boxOf(page, '[data-sidebar]')
    check(
      steps,
      'A1 sidebar oculto fuera del viewport en móvil',
      sidebar && sidebar.x + sidebar.width <= 1,
      { x: sidebar && sidebar.x, width: sidebar && sidebar.width }
    )
    const inert = await page.$eval('[data-sidebar]', (el) => el.hasAttribute('inert'))
    check(steps, 'A2 sidebar cerrado es inert', inert)
    const toggle = await boxOf(page, '[data-sidebar-toggle]')
    check(steps, 'A3 hamburguesa visible en la barra superior', toggle && toggle.width > 0)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    check(steps, 'A4 el editor no desborda horizontalmente', overflow <= 1, { overflow })

    const handleOpacity = await page.$eval(
      '[data-row-id="k1"] [data-block-handle]',
      (el) => getComputedStyle(el).opacity
    )
    check(
      steps,
      'A5 el handle del bloque es visible sin hover en táctil',
      handleOpacity === '1',
      { handleOpacity }
    )

    const kbdHidden = await page.$eval('[data-search-trigger-top] kbd', (el) => {
      const style = getComputedStyle(el)
      return style.display === 'none' || el.offsetParent === null
    })
    check(steps, 'A6 el atajo Ctrl K se oculta en pantalla estrecha', kbdHidden)
  })

  // --- B) Drawer ----------------------------------------------------------
  await runStage('B · drawer', async (steps) => {
    await openDrawer(page)
    check(steps, 'B1 la hamburguesa abre el drawer a pantalla completa', (await sidebarX(page)) === 0)
    const notInert = await page.$eval('[data-sidebar]', (el) => !el.hasAttribute('inert'))
    check(steps, 'B2 el drawer abierto sale de inert', notInert)

    const actionOpacity = await page.$eval(
      '[data-page-id="p1"] [data-page-action="open-menu"]',
      (el) => getComputedStyle(el).opacity
    )
    check(
      steps,
      'B3 las acciones de página se ven sin hover en táctil',
      actionOpacity === '1',
      { actionOpacity }
    )

    await page.tap('[data-page-id="p2"] [data-page-title]')
    await page.waitForTimeout(300)
    check(steps, 'B4 elegir página cierra el drawer', (await sidebarX(page)) < 0)
    const current = await page.textContent('[data-breadcrumb-current]')
    check(steps, 'B5 navegó a la subpágina', current.includes('Child page'), { current })

    await openDrawer(page)
    await page.locator('[data-sidebar-backdrop]').tap({ position: { x: 340, y: 400 } })
    await page.waitForTimeout(250)
    check(steps, 'B6 tocar el backdrop cierra el drawer', (await sidebarX(page)) < 0)

    // Edge swipe: abrir desde el borde izquierdo (eventos sobre el elemento,
    // como haría el puntero real con pointer capture).
    await dispatchOn(page, '[data-edge-swipe]', 'pointerdown', 2, 400)
    await dispatchOn(page, '[data-edge-swipe]', 'pointermove', 120, 402)
    await dispatchWindow(page, 'pointerup', 220, 404)
    await page.waitForTimeout(300)
    check(steps, 'B7 edge swipe desde la izquierda abre el drawer', (await sidebarX(page)) === 0)

    await page.screenshot({ path: path.join(OUT, 'mobile-B-drawer.png') })

    // Swipe izquierda sobre el drawer: cerrar.
    const aside = await boxOf(page, '[data-sidebar]')
    const midY = aside.y + aside.height / 2
    await dispatchOn(page, '[data-sidebar]', 'pointerdown', 200, midY)
    await dispatchOn(page, '[data-sidebar]', 'pointermove', 120, midY)
    await dispatchWindow(page, 'pointerup', 40, midY)
    await page.waitForTimeout(300)
    check(steps, 'B8 swipe izquierda sobre el drawer lo cierra', (await sidebarX(page)) < 0)
  })

  // --- C) Sheets y gestos -------------------------------------------------
  await runStage('C · sheets y gestos', async (steps) => {
    // Volver a la página raíz para operar sobre sus bloques.
    await openDrawer(page)
    await page.tap('[data-page-id="p1"] [data-page-title]')
    await page.waitForTimeout(300)

    const handle = await boxOf(page, '[data-row-id="k2"] [data-block-handle]')
    await page
      .locator('[data-row-id="k2"] [data-block-handle]')
      .tap({ position: { x: handle.width / 2, y: handle.height / 2 } })
    await page.waitForTimeout(250)
    const sheet = await boxOf(page, '[data-sheet="block-menu"]')
    check(steps, 'C1 tap en el handle abre el menú como sheet', sheet && sheet.width > 0)
    const sheetAtBottom = await page.evaluate(() => {
      const panel = document.querySelector('[data-sheet="block-menu"]')
      const rect = panel.getBoundingClientRect()
      return Math.abs(rect.bottom - window.innerHeight) <= 1
    })
    check(steps, 'C2 el sheet está pegado al borde inferior', sheetAtBottom)

    await page.tap('[data-menu-action="convert"]')
    await page.waitForTimeout(150)
    const convertItem = await boxOf(page, '[data-menu-action="convert-heading"]')
    check(
      steps,
      'C3 el submenú de conversión se mantiene en el sheet',
      convertItem && convertItem.width > 0
    )
    await page.tap('[data-menu-action="convert-heading"]')
    await page.waitForTimeout(250)
    const converted = await page.$eval('[data-row-id="k2"]', (el) => el.dataset.blockType)
    check(steps, 'C4 convertir a heading actualiza el bloque', converted === 'heading', { converted })

    // Long-press en checkbox → selector de estados, sin togglear.
    await longPress(page, '[data-todo-checkbox]')
    const statusSheet = await boxOf(page, '[data-sheet="status-menu"]')
    check(
      steps,
      'C5 long-press en el checkbox abre el selector de estados',
      statusSheet && statusSheet.width > 0
    )
    const stillTodo = await page.$eval('[data-todo-checkbox]', (el) => el.dataset.status)
    check(steps, 'C6 el long-press no marca la tarea como hecha', stillTodo === 'todo', {
      status: stillTodo
    })

    await page.tap('[data-status-option="in-progress"]')
    await page.waitForTimeout(250)
    const inProgress = await page.$eval('[data-todo-checkbox]', (el) => el.dataset.status)
    check(steps, 'C7 elegir un estado lo aplica y cierra el sheet', inProgress === 'in-progress', {
      status: inProgress
    })

    await page.tap('[data-todo-checkbox]')
    await page.waitForTimeout(250)
    const done = await page.$eval('[data-todo-checkbox]', (el) => el.dataset.status)
    check(steps, 'C8 tap normal en el checkbox alterna a done', done === 'done', { status: done })

    await page.screenshot({ path: path.join(OUT, 'mobile-C-status.png') })

    // Long-press en fila de página → menú de página.
    await openDrawer(page)
    await longPress(page, '[data-page-id="p3"] [data-page-title]')
    const pageSheet = await boxOf(page, '[data-sheet="page-menu"]')
    check(steps, 'C9 long-press en una fila abre el menú de página', pageSheet && pageSheet.width > 0)
    await dismissSheets(page)
    await closeDrawer(page)

    // Slash menu como sheet (sobre un bloque vacío, que convierte en sitio).
    await page.tap('[data-row-id="k6"] [data-block-id]')
    await page.keyboard.type('/')
    await page.waitForTimeout(350)
    const slashSheet = await boxOf(page, '[data-sheet="slash-menu"]')
    check(steps, 'C10 escribir / abre el slash menu como sheet', slashSheet && slashSheet.width > 0)
    await page.tap('[data-slash-item="quote"]')
    await page.waitForTimeout(250)
    const quoted = await page.$eval('[data-row-id="k6"]', (el) => el.dataset.blockType)
    check(steps, 'C11 elegir un comando aplica el tipo de bloque', quoted === 'quote', { quoted })

    // Búsqueda a pantalla completa.
    await page.tap('[data-search-trigger-top]')
    await page.waitForTimeout(300)
    const palette = await boxOf(page, '[data-search-palette] > div')
    check(
      steps,
      'C12 la búsqueda ocupa el viewport completo',
      palette && palette.width >= VIEWPORT.width - 1 && palette.height >= VIEWPORT.height - 1,
      palette && { width: palette.width, height: palette.height }
    )
    await page.fill('[data-search-input]', 'Hola')
    await page.waitForTimeout(400)
    const results = await page.locator('[data-search-result]').count()
    check(steps, 'C13 la búsqueda devuelve resultados', results >= 1, { results })
    await page.screenshot({ path: path.join(OUT, 'mobile-C-search.png') })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    const paletteGone = (await page.locator('[data-search-palette]').count()) === 0
    check(steps, 'C14 Esc cierra la búsqueda', paletteGone)
    const snap = await state(page)
  })

  // --- D) Reordenar con long-press + arrastre -----------------------------
  await runStage('D · drag táctil', async (steps) => {
    // Bloque: arrastrar k2 (párrafo) desde el handle hasta debajo de k4.
    const handle = await boxOf(page, '[data-row-id="k2"] [data-block-handle]')
    const target = await boxOf(page, '[data-row-id="k4"]')
    const startX = handle.x + handle.width / 2
    const startY = handle.y + handle.height / 2
    const endY = target.y + target.height - 2
    await dispatchOn(page, '[data-row-id="k2"] [data-block-handle]', 'pointerdown', startX, startY)
    await dispatchWindow(page, 'pointermove', startX, startY + 40)
    await dispatchWindow(page, 'pointermove', startX, endY)
    await dispatchWindow(page, 'pointerup', startX, endY)
    await page.waitForTimeout(400)
    const order = (await state(page))
      .blocks.filter((block) => block.pageId === 'p1')
      .sort((a, b) => a.position - b.position)
      .map((block) => block.id)
      .join(',')
    check(steps, 'D1 arrastrar el handle reordena el bloque', order === 'k1,k3,k4,k2,k5,k6', { order })

    // Página: long-press p3 y soltar sobre la parte superior de p1 (antes).
    await openDrawer(page)
    const p3 = await boxOf(page, '[data-page-id="p3"] [data-page-title]')
    const p1 = await boxOf(page, '[data-page-id="p1"] [data-page-title]')
    const fromX = p3.x + p3.width / 2
    const fromY = p3.y + p3.height / 2
    const toY = p1.y + 2
    await dispatchOn(page, '[data-page-id="p3"] [data-page-title]', 'pointerdown', fromX, fromY)
    await page.waitForTimeout(650)
    await dispatchWindow(page, 'pointermove', fromX, fromY - 12)
    await dispatchWindow(page, 'pointermove', fromX, toY)
    await dispatchWindow(page, 'pointerup', fromX, toY)
    await page.waitForTimeout(400)
    const roots = (await state(page))
      .pages.filter((item) => item.parentId === null)
      .sort((a, b) => a.position - b.position)
      .map((item) => item.id)
      .join(',')
    check(steps, 'D2 long-press + arrastre reordena páginas', roots === 'p3,p1', { roots })
    await page.screenshot({ path: path.join(OUT, 'mobile-D-pages.png') })
  })

  await browser.close()
  fs.writeFileSync(path.join(OUT, 'mobile-report.json'), JSON.stringify(report, null, 2))

  const totalChecks = report.stages.reduce((sum, stage) => sum + stage.checks.length, 0)
  const failedChecks = report.stages.flatMap((stage) =>
    stage.checks.filter((item) => !item.ok).map((item) => `${stage.name}: ${item.name}`)
  )
  console.log(JSON.stringify({ totalChecks, failedChecks, errors: report.errors, consoleErrors }, null, 2))
  if (failedChecks.length > 0 || report.errors.length > 0 || consoleErrors.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
})
