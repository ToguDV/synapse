// Runner E2E de la Fase 6 (theme claro/oscuro/sistema) con Playwright + Chromium.
// Cubre: tema por defecto según el sistema, preferencia persistida, ciclo del botón
// del sidebar, clase/tokens aplicados y colores computados en ambos temas.
//
// Uso (desde el host, con el dev server del renderer en 5174):
//   docker compose run -d --rm --name synapse-e2e dev npx vite --config tests/vite.e2e.config.ts
//   node e2e/theme.e2e.cjs
const { chromium } = require('./playwright.cjs')
const path = require('node:path')
const fs = require('node:fs')

const URL = `http://localhost:${process.env.SYNAPSE_E2E_PORT || 5174}/`
const MOCK = path.join(__dirname, 'mock-api.js')
const OUT = path.join(require('node:os').tmpdir(), 'opencode')
fs.mkdirSync(OUT, { recursive: true })

const consoleErrors = []
const report = { stages: [], consoleErrors }

const check = (steps, name, ok, detail) => steps.push({ name, ok: !!ok, detail })

const settle = (page, ms = 200) => page.waitForTimeout(ms)
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })
const state = (page) => page.evaluate(() => window.__mockState())

const themeDom = (page) =>
  page.evaluate(() => {
    const root = document.documentElement
    const app = document.querySelector('#root > div')
    const button = document.querySelector('[data-theme-toggle]')
    return {
      theme: root.dataset.theme ?? null,
      darkClass: root.classList.contains('dark'),
      preference: button?.getAttribute('data-theme-preference') ?? null,
      canvasVar: getComputedStyle(root).getPropertyValue('--canvas').trim(),
      appBackground: app ? getComputedStyle(app).backgroundColor : null,
      appColor: app ? getComputedStyle(app).color : null
    }
  })

async function waitTheme(page, theme) {
  await page.waitForFunction(
    (expected) => document.documentElement.dataset.theme === expected,
    theme
  )
}

async function setThemePreference(page, preference) {
  const current = await page.getAttribute('[data-theme-toggle]', 'data-theme-preference')
  if (current === preference) return
  await page.click(`[data-theme-option="${preference}"]`)
  await page.waitForFunction(
    (expected) =>
      document.querySelector('[data-theme-toggle]')?.getAttribute('data-theme-preference') ===
      expected,
    preference
  )
}

async function setup(page) {
  await page.goto(URL)
  await page.waitForSelector('div[contenteditable]')
  await page.evaluate(() => window.__mockReset())
  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await settle(page, 200)
}

async function stage1System(page) {
  const steps = []
  await setup(page)

  let dom = await themeDom(page)
  check(
    steps,
    'por defecto sigue al sistema (claro)',
    dom.theme === 'light' && !dom.darkClass && dom.preference === 'system',
    dom
  )

  await page.emulateMedia({ colorScheme: 'dark' })
  await waitTheme(page, 'dark')
  dom = await themeDom(page)
  check(
    steps,
    'cambiar el sistema a oscuro actualiza el tema en vivo',
    dom.darkClass && dom.preference === 'system',
    dom
  )

  await page.emulateMedia({ colorScheme: 'light' })
  await waitTheme(page, 'light')
  dom = await themeDom(page)
  check(steps, 'volver al sistema claro revierte el tema', !dom.darkClass, dom)

  return { steps }
}

async function stage2Toggle(page) {
  const steps = []
  let dom = await themeDom(page)
  check(steps, 'el selector arranca en Sistema', dom.preference === 'system', dom)

  await page.click('[data-theme-option="light"]')
  await waitTheme(page, 'light')
  dom = await themeDom(page)
  check(steps, 'elegir Claro fija el tema claro', dom.preference === 'light' && !dom.darkClass, dom)

  await page.click('[data-theme-option="dark"]')
  await waitTheme(page, 'dark')
  dom = await themeDom(page)
  check(steps, 'elegir Oscuro fija el tema oscuro', dom.preference === 'dark' && dom.darkClass, dom)
  await shot(page, 'e2e-theme-dark.png')

  await page.click('[data-theme-option="system"]')
  await waitTheme(page, 'light')
  dom = await themeDom(page)
  check(
    steps,
    'volver a Sistema resuelve claro',
    dom.preference === 'system' && !dom.darkClass,
    dom
  )

  const mocked = await state(page)
  check(
    steps,
    'cada cambio se persiste en settings',
    mocked.settings.theme === 'system' &&
      mocked.calls.filter((call) => call[0] === 'settings-set').length === 3,
    mocked.settings
  )

  return { steps }
}

async function stage3Persistence(page) {
  const steps = []
  await setThemePreference(page, 'dark')
  await waitTheme(page, 'dark')

  const before = await state(page)
  check(steps, 'queda fijado el tema oscuro', before.settings.theme === 'dark', before.settings)

  await page.reload()
  await page.waitForSelector('div[contenteditable]')
  await waitTheme(page, 'dark')
  const dom = await themeDom(page)
  check(
    steps,
    'al recargar se restaura la preferencia guardada',
    dom.preference === 'dark' && dom.darkClass,
    dom
  )
  await shot(page, 'e2e-theme-dark-reload.png')
  return { steps }
}

async function stage4Tokens(page) {
  const steps = []
  await setThemePreference(page, 'light')
  await waitTheme(page, 'light')

  let dom = await themeDom(page)
  check(steps, 'en claro el token canvas es Latte', dom.canvasVar === '#eff1f5', dom)
  check(
    steps,
    'el contenedor de la app usa el fondo claro',
    dom.appBackground === 'rgb(239, 241, 245)',
    dom
  )
  check(steps, 'el texto en claro es oscuro', dom.appColor === 'rgb(76, 79, 105)', dom)
  await shot(page, 'e2e-theme-light.png')

  await setThemePreference(page, 'dark')
  await waitTheme(page, 'dark')
  dom = await themeDom(page)
  check(steps, 'en oscuro el token canvas es Mocha', dom.canvasVar === '#1e1e2e', dom)
  check(
    steps,
    'el contenedor de la app usa el fondo oscuro',
    dom.appBackground === 'rgb(30, 30, 46)',
    dom
  )
  check(steps, 'el texto en oscuro es claro', dom.appColor === 'rgb(205, 214, 244)', dom)

  return { steps }
}

async function stage5SearchTheme(page) {
  const steps = []
  await page.keyboard.press('Control+k')
  await page.waitForSelector('[data-search-palette]')
  const panel = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-search-palette] > div')).backgroundColor
  )
  check(steps, 'la paleta de búsqueda usa el fondo oscuro del tema', panel === 'rgb(49, 50, 68)', panel)
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-search-palette]', { state: 'detached' })

  await setThemePreference(page, 'light')
  await waitTheme(page, 'light')
  await page.keyboard.press('Control+k')
  await page.waitForSelector('[data-search-palette]')
  const panelLight = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-search-palette] > div')).backgroundColor
  )
  check(
    steps,
    'la paleta cambia con el tema a claro',
    panelLight === 'rgb(255, 255, 255)',
    panelLight
  )
  await page.keyboard.press('Escape')
  return { steps }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light'
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push('[console] ' + msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push('[pageerror] ' + err.message))
  await page.addInitScript({ path: MOCK })

  const stages = [
    ['stage1 · preferencia del sistema', stage1System],
    ['stage2 · ciclo del toggle', stage2Toggle],
    ['stage3 · persistencia al recargar', stage3Persistence],
    ['stage4 · tokens por tema', stage4Tokens],
    ['stage5 · tema en la búsqueda', stage5SearchTheme]
  ]
  for (const [name, fn] of stages) {
    try {
      const result = await fn(page)
      report.stages.push({ name, steps: result.steps })
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
  fs.writeFileSync(path.join(OUT, 'e2e-theme-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.summary, null, 2))
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
