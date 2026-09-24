// Prueba dirigida (tester): seguimiento del ancla de popovers tras el fix de
// revisión sobre HEAD c1d7d4f (getAnchor + useAnchoredPosition con scroll/resize).
//
// Cubre:
//   A) BlockMenu abierto desde el handle y scroll del contenido del editor.
//   B) PageMenu abierto desde el botón ⋯ y scroll del nav del sidebar.
//   C) PageMenu abierto y resize de viewport.
//   D) SlashMenu abierto con "/" y scroll.
//
// Uso (desde el host, con el server E2E del renderer en 5174):
//   docker compose run -d --rm --name synapse-e2e dev npx vite --config tests/vite.e2e.config.ts
//   node e2e/anchor-tracking.e2e.cjs
const { chromium } = require('./playwright.cjs')
const path = require('node:path')
const fs = require('node:fs')

const URL = 'http://localhost:5174/'
const MOCK = path.join(__dirname, 'mock-api.js')
const OUT = path.join(require('node:os').tmpdir(), 'opencode')
fs.mkdirSync(OUT, { recursive: true })

const consoleErrors = []
const report = { stages: [], consoleErrors }

const check = (steps, name, ok, detail) => steps.push({ name, ok: !!ok, detail })
const settle = (page, ms = 200) => page.waitForTimeout(ms)
const fmt = (bb) =>
  bb
    ? {
        x: Math.round(bb.x * 10) / 10,
        y: Math.round(bb.y * 10) / 10,
        w: Math.round(bb.width * 10) / 10,
        h: Math.round(bb.height * 10) / 10
      }
    : null

const P = (i) => ({
  id: `p${i}`,
  title: `Página ${i}`,
  parentId: null,
  icon: null,
  position: i,
  createdAt: i + 1,
  updatedAt: i + 1
})

const B = (i, pageId = 'p0') => ({
  id: `seed-${i}`,
  pageId,
  type: 'paragraph',
  content: JSON.stringify({ text: `bloque ${i} de contenido` }),
  position: i,
  indent: 0,
  createdAt: 1,
  updatedAt: 1
})

async function seed(page, data) {
  if (!page.url().startsWith('http')) {
    await page.goto(URL)
    await page.waitForSelector('div[contenteditable]')
  }
  await page.evaluate((payload) => {
    localStorage.setItem('__synapse_e2e_mock__', JSON.stringify(payload))
  }, data)
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 250)
}

async function waitPositioned(page, selector) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel)
      return !!el && el.style.left !== '-9999px' && el.style.top !== '-9999px'
    },
    selector,
    { timeout: 5000 }
  )
}

async function rectOf(page, selector) {
  const loc = page.locator(selector).first()
  if ((await loc.count()) === 0) return null
  const meta = await loc.evaluate((node) => {
    const r = node.getBoundingClientRect()
    const s = getComputedStyle(node)
    return {
      rect: {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right
      },
      inline: { left: node.style.left, top: node.style.top, visibility: s.visibility, display: s.display },
      connected: node.isConnected
    }
  })
  const boundingBox = (await loc.boundingBox()) ?? {
    x: meta.rect.x,
    y: meta.rect.y,
    width: meta.rect.width,
    height: meta.rect.height
  }
  return { boundingBox, ...meta }
}

// --- A) BlockMenu + scroll del editor -------------------------------------
async function stageA(page) {
  const steps = []
  await seed(page, { pages: [P(0)], blocks: Array.from({ length: 60 }, (_, i) => B(i)) })

  const HANDLE = '[data-row-id="seed-5"] [data-block-handle]'
  const MENU = '[data-block-menu]'
  const row = page.locator('[data-row-id="seed-5"]')
  await row.hover()
  await row.locator('[data-block-handle]').click()
  await page.waitForSelector(MENU)
  await waitPositioned(page, MENU)
  await settle(page, 150)

  const h1 = await rectOf(page, HANDLE)
  const m1 = await rectOf(page, MENU)
  const gapDown = m1 ? m1.boundingBox.y - (h1.boundingBox.y + h1.boundingBox.height) : null
  const gapUp = m1 ? h1.boundingBox.y - (m1.boundingBox.y + m1.boundingBox.height) : null
  check(
    steps,
    'A1 BlockMenu visible pegado al handle antes del scroll (gap 6)',
    !!m1 && (Math.abs(gapDown - 6) <= 1 || Math.abs(gapUp - 6) <= 1),
    { handle: fmt(h1.boundingBox), menu: fmt(m1.boundingBox), gapDown, gapUp, inline: m1.inline }
  )
  await page.screenshot({ path: path.join(OUT, 'anchor-A1-blockmenu-before.png') })

  await page.locator('main').evaluate((el) => {
    el.scrollTop += 240
  })
  await settle(page, 250)

  const h2 = await rectOf(page, HANDLE)
  const m2 = await rectOf(page, MENU)
  const dh = h2 && h1 ? h2.boundingBox.y - h1.boundingBox.y : null
  const dm = m2 && m1 ? m2.boundingBox.y - m1.boundingBox.y : null
  const dx = m2 && m1 ? m2.boundingBox.x - m1.boundingBox.x : null
  check(
    steps,
    'A2 tras scroll +240 el handle sube ~240',
    dh !== null && Math.abs(dh + 240) <= 2,
    { h1: fmt(h1.boundingBox), h2: fmt(h2.boundingBox), dh }
  )
  check(
    steps,
    'A3 el BlockMenu sigue al handle (mismo delta vertical)',
    dm !== null && dh !== null && Math.abs(dm - dh) <= 1,
    { m1: fmt(m1.boundingBox), m2: fmt(m2.boundingBox), dm, dh }
  )
  check(
    steps,
    'A4 el BlockMenu mantiene la X (scroll solo vertical)',
    dx !== null && Math.abs(dx) <= 1,
    { dx, m1x: fmt(m1.boundingBox).x, m2x: fmt(m2.boundingBox).x }
  )
  check(
    steps,
    'A5 el BlockMenu sigue dentro del viewport tras el scroll',
    !!m2 &&
      m2.boundingBox.y >= 0 &&
      m2.boundingBox.y + m2.boundingBox.height <= 800 &&
      m2.inline.visibility !== 'hidden',
    { menu: fmt(m2.boundingBox), inline: m2.inline }
  )
  await page.screenshot({ path: path.join(OUT, 'anchor-A2-blockmenu-after-scroll.png') })

  await page.locator('main').evaluate((el) => {
    el.scrollTop += 600
  })
  await settle(page, 250)
  const m3 = await rectOf(page, MENU)
  const count = await page.locator(MENU).count()
  check(
    steps,
    'A6 con el ancla fuera de vista el BlockMenu se clampa arriba (top≈8) y sigue visible',
    count === 1 &&
      !!m3 &&
      Math.abs(m3.boundingBox.y - 8) <= 1 &&
      m3.boundingBox.y + m3.boundingBox.height <= 800,
    { count, menu: fmt(m3 && m3.boundingBox), inline: m3 && m3.inline }
  )
  await page.screenshot({ path: path.join(OUT, 'anchor-A3-blockmenu-clamp.png') })
  return steps
}

// --- B) PageMenu + scroll del sidebar --------------------------------------
async function stageB(page) {
  const steps = []
  await seed(page, { pages: Array.from({ length: 60 }, (_, i) => P(i)), blocks: [] })

  const BTN = '[data-page-id="p5"] [data-page-action="open-menu"]'
  const MENU = '[data-page-menu="p5"]'
  const row = page.locator('[data-page-id="p5"]')
  await row.hover()
  await row.locator('[data-page-action="open-menu"]').click()
  await page.waitForSelector(MENU)
  await waitPositioned(page, MENU)
  await settle(page, 150)

  const b1 = await rectOf(page, BTN)
  const m1 = await rectOf(page, MENU)
  const rightGap = m1 ? m1.boundingBox.x - (b1.boundingBox.x + b1.boundingBox.width) : null
  check(
    steps,
    'B1 PageMenu visible alineado a la derecha del botón ⋯ (gap 6)',
    !!m1 && Math.abs(rightGap - 6) <= 1,
    { button: fmt(b1.boundingBox), menu: fmt(m1.boundingBox), rightGap, inline: m1.inline }
  )
  await page.screenshot({ path: path.join(OUT, 'anchor-B1-pagemenu-before.png') })

  await page.locator('nav:not([data-breadcrumbs])').evaluate((el) => {
    el.scrollTop += 100
  })
  await settle(page, 250)

  const b2 = await rectOf(page, BTN)
  const m2 = await rectOf(page, MENU)
  const db = b2 && b1 ? b2.boundingBox.y - b1.boundingBox.y : null
  const dm = m2 && m1 ? m2.boundingBox.y - m1.boundingBox.y : null
  check(
    steps,
    'B2 el nav scrollea ~100 y el botón sube con él',
    db !== null && Math.abs(db + 100) <= 2,
    { b1: fmt(b1.boundingBox), b2: fmt(b2.boundingBox), db }
  )
  check(
    steps,
    'B3 el PageMenu sigue al botón ⋯ (mismo delta vertical)',
    dm !== null && db !== null && Math.abs(dm - db) <= 1,
    { m1: fmt(m1.boundingBox), m2: fmt(m2.boundingBox), dm, db }
  )
  check(
    steps,
    'B4 el PageMenu no queda cortado por arriba ni fuera del viewport',
    !!m2 &&
      m2.boundingBox.y >= 0 &&
      m2.boundingBox.y + m2.boundingBox.height <= 800 &&
      m2.boundingBox.x >= 0 &&
      m2.boundingBox.x + m2.boundingBox.width <= 1280,
    { menu: fmt(m2.boundingBox), viewport: { w: 1280, h: 800 } }
  )
  await page.screenshot({ path: path.join(OUT, 'anchor-B2-pagemenu-after-scroll.png') })

  await page.locator('nav:not([data-breadcrumbs])').evaluate((el) => {
    el.scrollTop += 400
  })
  await settle(page, 250)
  const m3 = await rectOf(page, MENU)
  const count = await page.locator(MENU).count()
  check(
    steps,
    'B5 con el botón fuera de vista el PageMenu se clampa arriba (top≈8) y sigue visible',
    count === 1 &&
      !!m3 &&
      Math.abs(m3.boundingBox.y - 8) <= 1 &&
      m3.boundingBox.y + m3.boundingBox.height <= 800,
    { count, menu: fmt(m3 && m3.boundingBox), inline: m3 && m3.inline }
  )
  await page.screenshot({ path: path.join(OUT, 'anchor-B3-pagemenu-clamp.png') })
  return steps
}

// --- C) PageMenu + resize de viewport --------------------------------------
async function stageC(page) {
  const steps = []
  await seed(page, { pages: Array.from({ length: 60 }, (_, i) => P(i)), blocks: [] })

  const MENU = '[data-page-menu="p5"]'
  const row = page.locator('[data-page-id="p5"]')
  await row.hover()
  await row.locator('[data-page-action="open-menu"]').click()
  await page.waitForSelector(MENU)
  await waitPositioned(page, MENU)
  await settle(page, 150)
  const m1 = await rectOf(page, MENU)

  await page.setViewportSize({ width: 700, height: 500 })
  await settle(page, 300)
  const m2 = await rectOf(page, MENU)
  check(
    steps,
    'C1 tras resize a 700x500 el PageMenu cabe entero en el viewport',
    !!m2 &&
      m2.boundingBox.x >= 0 &&
      m2.boundingBox.x + m2.boundingBox.width <= 700 &&
      m2.boundingBox.y >= 0 &&
      m2.boundingBox.y + m2.boundingBox.height <= 500,
    {
      before: fmt(m1 && m1.boundingBox),
      after: fmt(m2 && m2.boundingBox),
      viewport: { w: 700, h: 500 },
      inline: m2 && m2.inline
    }
  )
  await page.screenshot({ path: path.join(OUT, 'anchor-C1-resize-700x500.png') })

  await page.setViewportSize({ width: 700, height: 300 })
  await settle(page, 300)
  const m3 = await rectOf(page, MENU)
  check(
    steps,
    'C2 tras resize a 700x300 el PageMenu cabe entero (abre hacia arriba si hace falta)',
    !!m3 &&
      m3.boundingBox.x >= 0 &&
      m3.boundingBox.x + m3.boundingBox.width <= 700 &&
      m3.boundingBox.y >= 0 &&
      m3.boundingBox.y + m3.boundingBox.height <= 300,
    {
      before: fmt(m2 && m2.boundingBox),
      after: fmt(m3 && m3.boundingBox),
      viewport: { w: 700, h: 300 },
      inline: m3 && m3.inline
    }
  )
  await page.screenshot({ path: path.join(OUT, 'anchor-C2-resize-700x300.png') })

  await page.setViewportSize({ width: 1280, height: 800 })
  await settle(page, 250)
  const m4 = await rectOf(page, MENU)
  check(
    steps,
    'C3 al restaurar 1280x800 el PageMenu vuelve a una posición válida y visible',
    !!m4 &&
      m4.boundingBox.y >= 0 &&
      m4.boundingBox.y + m4.boundingBox.height <= 800 &&
      m4.boundingBox.x + m4.boundingBox.width <= 1280,
    { menu: fmt(m4 && m4.boundingBox), inline: m4 && m4.inline }
  )
  return steps
}

// --- D) SlashMenu + scroll -------------------------------------------------
async function stageD(page) {
  const steps = []
  await seed(page, { pages: [P(0)], blocks: Array.from({ length: 40 }, (_, i) => B(i)) })

  const MENU = '[data-slash-menu]'
  const caretRect = () =>
    page.evaluate(() => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return null
      const range = sel.getRangeAt(0).cloneRange()
      const rects = range.getClientRects()
      const r = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom }
    })

  await page.locator('div[contenteditable]').first().click()
  await page.keyboard.type('/')
  await page.waitForSelector(MENU)
  await waitPositioned(page, MENU)
  await settle(page, 150)

  const c1 = await caretRect()
  const m1 = await rectOf(page, MENU)
  check(
    steps,
    'D1 SlashMenu visible anclado al caret (no oculto en -9999)',
    !!m1 && !!c1 && m1.inline.visibility !== 'hidden' && m1.boundingBox.y >= 0,
    { caret: c1, menu: fmt(m1 && m1.boundingBox), inline: m1 && m1.inline }
  )
  await page.screenshot({ path: path.join(OUT, 'anchor-D1-slash-before.png') })

  await page.locator('main').evaluate((el) => {
    el.scrollTop += 120
  })
  await settle(page, 250)
  const c2 = await caretRect()
  const m2 = await rectOf(page, MENU)
  const dc = c1 && c2 ? c2.top - c1.top : null
  const dm = m1 && m2 ? m2.boundingBox.y - m1.boundingBox.y : null
  check(
    steps,
    'D2 el SlashMenu sigue al caret al hacer scroll (+120)',
    dc !== null && dm !== null && Math.abs(dm - dc) <= 1,
    {
      caret1: c1,
      caret2: c2,
      menu1: fmt(m1 && m1.boundingBox),
      menu2: fmt(m2 && m2.boundingBox),
      dc,
      dm
    }
  )
  check(
    steps,
    'D3 el SlashMenu no desaparece y sigue dentro del viewport',
    (await page.locator(MENU).count()) === 1 &&
      !!m2 &&
      m2.boundingBox.y >= 0 &&
      m2.boundingBox.y + m2.boundingBox.height <= 800,
    { menu: fmt(m2 && m2.boundingBox), inline: m2 && m2.inline }
  )
  await page.screenshot({ path: path.join(OUT, 'anchor-D2-slash-after-scroll.png') })
  return steps
}

// --- E) PageMenu con el ancla por debajo del viewport -----------------------
async function stageE(page) {
  const steps = []
  await seed(page, { pages: Array.from({ length: 60 }, (_, i) => P(i)), blocks: [] })

  const MENU = '[data-page-menu="p55"]'
  const nav = page.locator('nav:not([data-breadcrumbs])')
  await nav.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await settle(page, 150)
  const row = page.locator('[data-page-id="p55"]')
  await row.hover()
  await row.locator('[data-page-action="open-menu"]').click()
  await page.waitForSelector(MENU)
  await waitPositioned(page, MENU)
  await settle(page, 150)
  const m1 = await rectOf(page, MENU)

  await nav.evaluate((el) => {
    el.scrollTop = 0
  })
  await settle(page, 250)
  const m2 = await rectOf(page, MENU)
  check(
    steps,
    'E1 con el ancla por debajo del viewport el PageMenu se clampa abajo y sigue visible',
    !!m2 &&
      m2.inline.visibility !== 'hidden' &&
      Math.abs(m2.boundingBox.y + m2.boundingBox.height - 792) <= 1,
    {
      before: fmt(m1 && m1.boundingBox),
      after: fmt(m2 && m2.boundingBox),
      inline: m2 && m2.inline
    }
  )
  await page.screenshot({ path: path.join(OUT, 'anchor-E1-pagemenu-bottom-clamp.png') })
  return steps
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
    ['A · BlockMenu + scroll del editor', stageA],
    ['B · PageMenu + scroll del sidebar', stageB],
    ['C · PageMenu + resize de viewport', stageC],
    ['D · SlashMenu + scroll', stageD],
    ['E · PageMenu con ancla bajo el viewport', stageE]
  ]
  for (const [name, fn] of stages) {
    try {
      const steps = await fn(page)
      report.stages.push({ name, steps })
    } catch (error) {
      report.stages.push({ name, fatal: String(error && error.stack ? error.stack : error) })
    }
  }

  await browser.close()
  const failures = report.stages.flatMap((stage) =>
    (stage.steps ?? []).filter((step) => !step.ok).map((step) => `${stage.name}: ${step.name}`)
  )
  report.summary = {
    totalChecks: report.stages.flatMap((stage) => stage.steps ?? []).length,
    failedChecks: failures,
    fatalStages: report.stages.filter((stage) => stage.fatal).map((stage) => stage.name),
    consoleErrors
  }
  fs.writeFileSync(path.join(OUT, 'anchor-tracking-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.summary, null, 2))
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
