# Plan: Synapse — Editor de bloques estilo Notion (Electron + React)

## 0. Sandbox Docker (entorno de desarrollo)

Todo corre dentro de Docker; el host no instala nada. Requiere Docker + Compose y X11 (Linux nativo).

```bash
./docker/x11-allow.sh                              # una vez por sesión gráfica (ventanas X11 del contenedor)
docker compose run --rm dev npm install            # instalar/actualizar dependencias (en volumen, no en el host)
docker compose up dev                              # dev con HMR → ventana Electron en el escritorio
docker compose run --rm dev npm run typecheck      # tsc strict (node + web)
docker compose run --rm dev npm test               # vitest
docker compose run --rm builder npm run dist:linux # empaquetado (electron-builder)
docker compose down                                # parar (los volúmenes persisten: node_modules y caches)
```

- `.: /app` montado; usuario del contenedor `node` (uid 1000) = usuario del host → permisos limpios.
- `node_modules`, cache de npm y binarios de Electron viven en volúmenes Docker: aislados del host.
- `ELECTRON_DISABLE_SANDBOX=1` (el sandbox de Chromium no funciona en Docker; el aislamiento real lo da el contenedor). `ipc: host` para shared memory de Chromium.
- `ELECTRON_DISABLE_GPU=1` (solo dev): sin `/dev/dri` en el contenedor, Chromium debe renderizar por software.
- npm ≥11 bloquea postinstalls de terceros: `allowScripts` en package.json aprueba `electron`/`esbuild`/`electron-winstaller`/`better-sqlite3`, y el `postinstall` propio garantiza que el binario de Electron (`node_modules/electron/dist`) se extraiga y que `better-sqlite3` se reconstruya contra el ABI de Electron en cualquier `npm install` limpio.
- Los avisos de `dbus/bus.cc` en logs son cosméticos (no hay dbus en el contenedor).
- E2E (Playwright, headless, sin Electron): sirve solo el renderer en el contenedor y lanza los runners desde el host. Los runners resuelven Playwright con `e2e/playwright.cjs` (dep del proyecto → `SYNAPSE_PLAYWRIGHT` → caché de `npx`), así que ya no dependen de esta máquina:
  ```bash
  docker compose run -d --rm --name synapse-e2e dev npx vite --config tests/vite.e2e.config.ts
  node e2e/phase3.e2e.cjs && node e2e/phase4.e2e.cjs && node e2e/phase5.e2e.cjs && node e2e/phase6.e2e.cjs  # 42, 53, 48 y 29 checks
  node e2e/theme.e2e.cjs                                                            # 18 checks (claro/oscuro/sistema)
  node e2e/anchor-tracking.e2e.cjs                                                  # 18 checks (popovers: scroll/resize)
  node e2e/page-dnd.e2e.cjs                                                         # 21 checks (drag & drop de páginas)
  node e2e/mobile.e2e.cjs                                                           # 30 checks (drawer, sheets, gestos táctiles)
  node e2e/sidebar-virtualization.e2e.cjs                                           # 12 checks (filas montadas de la ventana)
  node e2e/adv-phase4.e2e.cjs                                                       # 133 checks (adversarial de bloques)
  node e2e/adv-selection.e2e.cjs                                                    # 53 checks (selección/reemplazo, todos verdes)
  docker stop synapse-e2e
  ```
- Capturas del README: `node e2e/screenshots.cjs` (mismo server E2E) regenera `docs/media/editor-dark.png`, `editor-light.png` y `mobile.png` sembrando `e2e/mock-api.js` a `deviceScaleFactor: 2`; regenerarlas si la UI cambia de forma visible.
- Smoke del paquete (sin instalarlo): `HOME=$(mktemp -d) timeout 20 ./release/Synapse-*-x86_64.AppImage --appimage-extract-and-run --no-sandbox` debe crear `$HOME/.config/synapse/synapse.db` con `pages`/`blocks`/`settings` (sale por timeout al seguir la app abierta; es lo esperado).
- `AGENTS.md` **se versiona** desde 2026-09-24 (se quitó del `.gitignore` junto al resto de herramientas de agentes); las constancias del proyecto se mantienen en este archivo.

## 1. Stack decidido

| Capa | Elección |
|---|---|
| Shell | Electron + **electron-vite** (scaffold/HMR) + **electron-builder** (empaquetado) |
| UI | React 18 + TypeScript strict + **Tailwind** |
| Estado | **Zustand** |
| Datos | **SQLite local** (better-sqlite3 en proceso main) — offline-first |
| Editor | **Propio, arquitectura por-bloque** (cada bloque = componente React con su `contenteditable`) |
| i18n | **Propia y tipada** (`t`/`tList`, plurales con `Intl.PluralRules`, catálogos TS), sin dependencias |
| Tests | Vitest (transformaciones, store y repositorios) + Playwright (E2E del renderer con `api` mockeada) |

## 2. Arquitectura

**Procesos:**
- **Main (Node)**: ventana, SQLite (esquema + repositorios), handlers IPC, búsqueda, `nativeTheme`
- **Preload**: `contextBridge` con API tipada (`api.pages.*`, `api.blocks.*`, `api.search.*`, `api.settings.*`) — `contextIsolation: true`, `nodeIntegration: false`, sandbox
- **Renderer (React)**: la app y el editor

**Modelo de datos (SQLite):**
- `pages` — id, title, parent_id, icon, position, timestamps (páginas anidadas)
- `blocks` — id, page_id, type, **content JSON**, position, indent, timestamps
- `settings` — key/value (preferencia de tema)
- Lista **plana con indent** (como Notion real): mucho más simple que árbol para mover/fusionar

**Núcleo del editor (lo que aprendes de verdad):**
- `BlockRegistry` (`editor/registry.ts`): fuente única por tipo de lo estructural (`icon`, `textClasses`, `continuation`, `textual`); los textos (`label`, `description`, `placeholder`, `keywords`) viven en el catálogo `i18n/locales/en.ts`; extensible a tablas/gráficas en el futuro.
- `transformaciones puras y testeables`: `split`, `merge`, `indent`, `outdent`, `move`, `changeType`, `duplicate`, `removeBlocks`, `insertAfter`
- `FocusManager`: caret por bloque, navegación con flechas, Enter/Backspace/Tab
- Undo/redo a nivel de bloque (snapshot de la lista)

**UI:** sidebar de páginas + editor; slash menu `/`; handle de bloque (menú + drag & drop); búsqueda global `Ctrl+K`; theme claro/oscuro/sistema; autosave debounced vía IPC.

## 3. Fases

1. **Scaffold** — electron-vite, TS, Tailwind, Zustand, config builder, seguridad IPC. ✅ HMR funciona
2. **Persistencia** — esquema SQLite, repositorios, IPC CRUD tipado, autosave. ✅ página por defecto, rename con autosave y persistencia verificada entre reinicios
   - ✅ **Tests implementados** en `tests/persistence.test.ts` (13 tests, corren en `npm test`).
   - Nota: better-sqlite3 v13 trae prebuilds N-API (`lib/linux-x64.js` → `prebuilds/linux-x64.node`), así que el mismo binario carga bajo Node/vitest y bajo Electron: ya no hace falta `ELECTRON_RUN_AS_NODE`.
3. **Núcleo del editor** ✅ — párrafo editable, foco/caret entre bloques, transformaciones puras + tests, undo/redo.
   - `editor/transforms.ts`: `split`, `merge` (con anterior/siguiente), `indent` (máx. prev+1), `outdent`, `move`, `changeType`; puros y con identidad estable (misma referencia si no hay cambio).
   - `editor/editorStore.ts`: Zustand con lista plana, `focusRequest` con nonce, autosave debounced que sincroniza altas/bajas/updates/orden contra IPC, undo/redo por snapshots (coalescencia de tecleo 600 ms, límite 200).
   - `editor/caret.ts` + `blocks/*`: `contenteditable` por bloque, Enter (split), Shift+Enter/code (salto de línea), Backspace en offset 0 (merge o heading→paragraph), Delete al final (merge), Tab/Shift+Tab, flechas arriba/abajo en los bordes.
   - Tests: 61 unit (transforms + store + repos) y 42 checks E2E (`e2e/phase3.e2e.cjs` con `tests/vite.e2e.config.ts`; el dev server del renderer se sirve con `npx vite --config tests/vite.e2e.config.ts` porque `electron-vite dev --rendererOnly` igual lanza Electron en v5).
4. **Bloques y UX Notion** ✅ — heading, bullet, todo, code, quote, divider; slash menu; handle + drag & drop; multi-selección
   - `editor/registry.ts`: fuente única por tipo (`label`, `icon`, `keywords`, `placeholder`, `textClasses`, `continuation`, `textual`); `BlockRow` ya no duplica estilos.
    - `editor/commands.ts`: reglas markdown puras (`# `, `- `, `[] `, `> `, ` ``` `, `---`) y `filterSlashCommands`; `editor/content.ts` serializa `{ text, status? }` (con lectura retrocompatible de `checked`; ver fase 9).
   - `ui/SlashMenu.tsx` (anclado al caret, ↑↓/Enter/Esc) y `ui/BlockMenu.tsx` + `blocks/BlockHandle.tsx` (convertir/duplicar/mover/eliminar).
   - Drag & drop con pointer events + placeholder en flujo e indent por posición X; multi-selección con Shift+click/Shift+flechas, Backspace y Ctrl+D sobre la selección; checkbox real en `todo`.
   - Nota: el placeholder del drag desplaza las filas ~6 px, así que el destino de soltado debe superar el punto medio ya desplazado de la fila.
   - Nota: los saltos de línea se representan como un `<div>` por línea (no como `\n` dentro de un nodo de texto: Chromium teclea antes del salto); `caret.ts` expone `readPlainText`/`writePlainText`/`insertPlainText` para leer y escribir ese DOM. Los divisores se saltan al elegir foco y al fusionar (`nearestTextualBlock`).
    - Tests: 115 unit (transforms + store + commands + repos) y 53 checks E2E (`e2e/phase4.e2e.cjs`, mismos comandos que la fase 3). Suites adversariales de regresión: `e2e/adv-phase4.e2e.cjs` (133 checks) y `e2e/adv-selection.e2e.cjs` (selección/reemplazo).
5. **Páginas** ✅ — sidebar en árbol, crear (raíz/subpágina), renombrar, borrar con confirmación, breadcrumbs e iconos
   - `store/pageTree.ts`: puro (`buildPageTree`, `flattenPages`, `pageAncestors`, `collectDescendantIds`, `nextPageAfterDelete`); huérfanas y ciclos se tratan como raíces.
   - `store/pagesStore.ts`: `createPage(parentId)`, `deletePage`, `setPageIcon`, `expandedIds`/`toggleExpanded`; el rename debounced usa un timer por página (`renameTimers`) para no cancelar renames pendientes de otras. Al borrar la página activa hace `editorStore.flush()` y luego `reset()` (para no intentar updates de bloques ya borrados) y elige reemplazo con `nextPageAfterDelete` (padre → anterior visible → siguiente); si no queda ninguna, crea una por defecto.
   - `ui/Sidebar.tsx` (árbol recursivo, expandir/colapsar, rename inline, acciones en hover), `ui/PageMenu.tsx`, `ui/Breadcrumbs.tsx`, `ui/IconPicker.tsx` + `ui/emojis.ts`, `ui/ConfirmDialog.tsx` y `ui/MenuItem.tsx` (compartido con `BlockMenu`).
    - Sin drag & drop de páginas al cerrar la fase (el repo ya soporta `move`; llegó en la fase 9); los iconos son un set curado de emojis sin dependencias.
   - Nota: los emojis usan `assets/fonts/NotoColorEmoji.ttf` (Noto Color Emoji, OFL) empaquetada vía `@font-face` en `main.css` con `unicode-range` (los contenedores Linux no traen fuente de emojis; el rango evita que la fuente afecte a dígitos/texto latino).
    - `ui/rectAnchor.ts`: `rectAnchor`/`rectAnchorIfConnected` + `useAnchoredPosition` (mide el popover tras montar con `ResizeObserver`, sigue al ancla en scroll/resize vía `getAnchor` opcional y clampa al viewport); lo usan `SlashMenu`, `BlockMenu`, `PageMenu` e `IconPicker`.
    - `ui/titleFit.ts`: el título del header es un `textarea` autoexpandible de una sola línea lógica (Enter no inserta salto; los `\n` pegados se normalizan a espacio). Auto-ajuste: mide el ancho con canvas y reduce la fuente de 36 a 24px para caber en una línea; agotado el mínimo, el texto hace wrap y crece en alto. El icono se ancla al centro de la primera línea (`titleIconOffset`) con `items-start`.
   - `editorStore.cancelLoad(pageId)` invalida cargas de páginas borradas (devuelve un `restore`); `deletePage` revalida el reset del editor y recupera la carga si el IPC falla.
    - Tests: 166 unit (incluidos `tests/pageTree.test.ts`, `tests/pagesStore.test.ts`, `tests/rectAnchor.test.ts` y `tests/titleFit.test.ts`) y 48 checks E2E (`e2e/phase5.e2e.cjs`, mismos comandos que la fase 3; la regresión de anclaje de popovers está en `e2e/anchor-tracking.e2e.cjs`, 18 checks).
6. **Búsqueda y pulido** ✅ — Ctrl+K, theme claro/oscuro/sistema, empaquetado con electron-builder
   - `shared/content.ts`: `parseBlockContent`/`serializeContent` viven en `shared` (main y renderer); `editor/content.ts` solo re-exporta.
   - `main/db/repositories/search.ts`: `search(term, limit)` con `LIKE` + `ESCAPE '\'` sobre `pages.title` y `blocks.content` (join con la página), páginas primero y `updated_at DESC`. Nota: `LIKE` solo pliega mayúsculas ASCII (`cancion` no encuentra `canción`).
   - `ui/SearchPalette.tsx` + `ui/searchResults.ts` (snippet puro con rango del match): modal Ctrl/⌘+K o botón del sidebar, debounce 120 ms, ↑↓/Enter/Esc, grupos Páginas/Bloques y salto a bloque con foco (`editorStore.focusBlock(pageId, blockId)` aplica un foco pendiente cuando la carga termina; `BlockList` consume `focusRequest` y hace `scrollIntoView`). Mientras hay término sin resultados y la consulta sigue en vuelo se pinta `search.searching` (`[data-search-searching]`) con la misma geometría que el estado vacío: sin eso el `<ul>` se quedaba sin hijos y el palette colapsaba a la barra de búsqueda en cada tecla (parpadeo de altura; regresión cubierta en fase 6).
   - `BlockList` solo carga la página si `editorStore.pageId !== pageId` (idempotente; evita dobles cargas al navegar desde la búsqueda).
   - Theme: tabla `settings` + `settings:get/set` IPC; `main/theme.ts` aplica `nativeTheme.themeSource` al arrancar y al cambiar; `store/themeStore.ts` resuelve `light|dark|system` (matchMedia en vivo) y aplica `.dark` + `data-theme` en `<html>`; toggle en el footer del sidebar. Colores vía tokens semánticos en `main.css` (`bg-canvas`, `text-ink`, `border-border`, `bg-hover`, `text-muted`, `bg-accent`…): claro por defecto y `.dark` los redefine. Sin `neutral-*` hardcodeados en el renderer.
   - Empaquetado: `resources/icon.png` (generado con `resources/make-icon.py`), `electron-builder.yml` con AppImage + deb (`linux.maintainer`, `syncDesktopName`, `artifactName`, `deb.packageName: synapse-untitled` para no colisionar con el paquete `synapse` de universe); `package.json` con `homepage` (lo exige el target deb). Verificado: `docker compose run --rm builder npm run dist:linux` y smoke con `HOME` temporal → `~/.config/synapse/synapse.db` con página/bloque inicial.
   - Tests: 184 unit (incluidos `tests/search.test.ts`, `tests/searchResults.test.ts` y `tests/theme.test.ts`) y 29 checks E2E (`e2e/phase6.e2e.cjs`) + 18 de theme (`e2e/theme.e2e.cjs`).
7. **i18n y UI en inglés** ✅ — catálogo tipado sin dependencias y base lista para multi-idioma
   - `renderer/src/i18n/`: `locales/en.ts` es el catálogo y la fuente del tipo `Messages`; `locales/index.ts` registra `CATALOGS` (`Locale = keyof typeof CATALOGS`). `t(clave, params)` con claves anidadas tipadas (`MessageKey`/`MessageListKey` generados con tipos recursivos), interpolación `{{param}}` y plurales `{ one, other }` resueltos con `Intl.PluralRules` (fallback `other`); `tList` para arrays; fallback locale actual → `en` → la propia clave; `useTranslation()` (`useSyncExternalStore`) devuelve `{ t, tList, locale }` y `setLocale()` actualiza `<html lang>`.
   - `registry.ts` conserva solo lo estructural (`icon`, `textClasses`, `continuation`, `textual`); label/description/placeholder/keywords viven en `blocks.*` del catálogo. `commands.ts` expone `buildSlashCommands()` (se reconstruye por locale) y `filterSlashCommands(query, commands)` sin default.
   - Traducidos todos los strings visibles (sidebar, menús, búsqueda, diálogos, tooltips, aria-labels, placeholders); el título por defecto se persiste localizado (`t('common.untitledPage')` → "Untitled") e `index.html` usa `lang="en"`. También en inglés los errores de IPC/repositorios, los `console.error` y la metadata de `package.json`/`electron-builder.yml`.
   - Añadir un idioma = `locales/<loc>.ts` + registrarlo en `CATALOGS` (el tipado garantiza paridad de claves) + un futuro setting `language` que llame a `setLocale()`; todavía no hay selector de idioma.
   - Nota: los títulos ya persistidos no se migran (dato de usuario) y las keywords españolas desaparecen (`/cita` ya no filtra): volverán con el catálogo `es`. Las keywords del slash menu ahora son por idioma.
   - Tests: 191 unit (nuevo `tests/i18n.test.ts`: interpolación, plurales, fallback y cobertura de `blocks.*`) y los mismos checks E2E (los runners ahora verifican textos en inglés; `adv-selection` mantiene sus 3 fallos latentes).
8. **Diseño (Mocha Synapse)** ✅ — sistema documentado en `DESIGN.md`, preview estático en `design/` y **aplicado a la app**
   - `DESIGN.md` (raíz): Catppuccin Mocha (oscuro) + Latte (claro), primario **mauve** (#cba6f7 / #8839ef), tokens semánticos mapeados a los de `main.css`, escala tipográfica (Inter + JetBrains Mono, OFL; en la app se autohospedarán), elevación por capas, componentes, spacing, radios y reglas.
   - `design/index.html` + `design/styles.css`: preview sin build ni dependencias con toggle Mocha/Latte, paleta, tipografía, componentes y mock del editor. No se empaqueta (electron-builder solo incluye `out/**`). En el preview las fuentes cargan de Google Fonts.
   - Decisiones: checkbox de todo **cuadrado** 16px/radio 4 con 5 estados; en Mocha el primario es pastel con texto `base` y en Latte morado saturado con texto blanco; los acentos nunca rellenan áreas grandes.
   - Contraste verificado (WCAG): Mocha ink/canvas 11.3:1, muted 7.4:1, botón 8.1:1; Latte ink 7.0:1, blanco sobre mauve 5.4:1.
   - Aplicado (2026-09-21, commits `d4d7fba`→`182c3c9`): `main.css` define los tokens Latte (`:root`) y Mocha (`.dark`) + `@theme inline` (surface-raised, code, hover-strong, accent-hover/ink, ring, glow, success/warning/error/info/sapphire/sky, shadow-pop/modal) + escala 11/12/13/16/20/24/32/40; Inter y JetBrains Mono se autohospedan como woff2 variable en `assets/fonts/` (subset latin); shell reestructurado (`App` con barra sticky de breadcrumbs + búsqueda, sidebar 220px con workspace/search/Pages/footer); `ui/Icon.tsx` (sprite SVG) y `ui/Kbd.tsx` sustituyen glifos/emoji de chrome; editor y overlays con los estilos del sistema.
   - Desviaciones conscientes: el toggle de tema es un **segmentado de 3 opciones** (sistema/claro/oscuro) que selecciona directo en vez de ciclar; no se añadieron el botón `+` del handle ni los iconos settings/más del mock (no inventar funcionalidad). El checkbox de 5 estados y el drag de páginas se completaron en la fase 9.
   - `:focus-visible` global vive en `@layer base` para que `outline-none` (utilidad) gane en las superficies de edición.
   - Iconos SVG v2 (2026-09-21): `Icon.tsx` define `IconTone`/`ICON_TONES` (search/plus/swap accent, flechas sky, copy/monitor/doc sapphire, moon info, sun/pencil/smile warning, check success, trash/x error; chevrons/grip/more/enter/settings neutros) y pinta `data-icon`/`data-tone`; `main.css` añade `--icon-*` (en Latte sky/sapphire/warning/success al 80% + black para pasar 3:1 sobre `--panel`; en Mocha pasteles tal cual) y reglas `[data-tone]` en `@layer base` (las utilidades Tailwind siguen ganando, p. ej. `text-current` del checkbox). `MenuItem` acepta `tone` y tinta el tile 28px con el tono al 12% fondo / 26% borde. Trazo 1.8→2 y tamaños +1 (11→12 … 16→17). Contraste verificado: claro ≥3.76:1 (panel) y ≥4.13:1 (tile tintado); oscuro ≥7.6:1. Sincronizado en `design/` y documentado en `DESIGN.md`; mismas suites E2E sin cambios de conteo.
   - Iconos neutros (2026-09-21, revisión posterior): se retiran los tonos de acento (demasiado color); todos los iconos heredan el color del texto (gris/blanco) y solo la papelera conserva `error` (rojo). `IconTone` queda en `'neutral' | 'error'`, `ICON_TONES` solo mapea `trash` (el resto neutro por defecto), `MenuItem` mantiene `tone` solo para el item destructivo. Sobreviven `--icon-error` y `[data-tone='error']` en `main.css` y `.i--error` en `design/styles.css`; el resto de `--icon-*`/`.i--*` se elimina. `DESIGN.md` actualizado (sección Iconography y contraste del error: Latte 4.5:1, Mocha 7.6:1). Mismas suites E2E verdes (solo los 3 latentes O2–O4).
9. **Pulido** ✅ — checkbox de 5 estados y drag & drop de páginas en el sidebar
   - Checkbox: `shared/content.ts` define `TODO_STATUSES`/`TodoStatus` (`backlog|todo|in-progress|done|cancelled`) y `BlockContent` pasa a `{ text, status }`; `parseBlockContent` traduce el legado `checked:true` → `done` y `serializeContent` omite `status` cuando es `todo` (sin migración de datos; el autosave reescribe el JSON al primer cambio). `EditorBlock.status`, `transforms.updateStatus`, `editorStore.toggleDone` (done ⇄ todo) y `setStatus`.
   - `ui/TodoStatusBox.tsx` (visuales del preview: dotted / sólido / medio relleno warning / success+check / faintest+X) y `ui/StatusMenu.tsx` (anclado al checkbox): clic alterna Todo/Done; clic derecho o Shift+F10 abre el selector de 5 estados; `data-status` nuevo en fila y checkbox, `data-checked` se mantiene derivado (`status === 'done'`) para no romper E2E; aria-label por estado. `blocks/todo` gana `statusLabel` y `status.*` en el catálogo.
   - Páginas: `pages.move` ahora es transaccional con `position` como índice de inserción (valida el padre, rechaza self/ciclos y renumera ambos padres); `store/pageTree.movePage` replica la semántica en puro (misma referencia en no-ops/inválidos) y `pagesStore.movePage` actualiza en optimista con rollback si el IPC falla. El sidebar arrastra el título con pointer events (umbral 4 px clic-vs-arrastre, zonas antes/después/dentro=append, auto-expand del destino a los 500 ms, guarda de descendientes, Escape cancela) con hooks `[data-page-dragging]`/`[data-page-drop]`.
   - Desviaciones conscientes: el selector de estados es solo de escritorio (el long-press táctil irá con la revisión completa de UI móvil); mover páginas no tiene alternativa por teclado (el DnD es la única vía).
   - Tests: 202 unit (+11: `updateStatus`, `setStatus`, parse legado y `movePage` en `pageTree`/`pagesStore`) y nuevos checks E2E (`adv-phase4` 133, `phase4` y `phase-5` sin cambios de conteo) + runner nuevo `e2e/page-dnd.e2e.cjs` (21 checks).
   - Revisión de fidelidad al preview (2026-09-21): sidebar con indentación por `margin-left` 16px (el hover de las hijas ya no ocupa todo el ancho), `gap`/padding de fila 6/8px, caret 14px, título de página en 600 (Electron sin GPU adelgaza el 500; desviación consciente), monograma del workspace Inter 10px/600 al 22% de acento, kbd del buscador con borde/fondo (sin override), segmented con `bg-hover`, radio 9px y botones de 26px; breadcrumbs/compactos, etiquetas de menú en 500, Kbd a 5px, diálogo con botones compactos, títulos de bloque a 34px/-0.03em, heading a 22px, quote/code con `my-2` y code en `--ink-soft`, handle en `--muted` con el menú abierto.
10. **UI responsive y táctil** ✅ — drawer, bottom sheets y gestos para pantallas estrechas
    - Helpers: `ui/useMediaQuery.ts` (`useIsMobile` = `max-width: 768px`; `useTouchInput` = `pointer: coarse`), `ui/Sheet.tsx` (hoja inferior con backdrop, Escape y filas de 44px), `ui/longPress.ts` (450 ms, cancela a 8px, suprime el click posterior; el clic derecho comparte handler) y `ui/swipe.ts` (swipe horizontal, el eje vertical queda para el scroll). En `main.css`, variante `coarse` (`any-pointer: coarse`), `touch-action` base y sin tap-highlight/callout.
    - Shell: `App` usa `h-dvh`, hamburguesa `md:hidden`, drawer en `Sidebar` (280px/max 85vw, backdrop, `inert`+`aria-hidden` al cerrar, cierre al navegar, con la X, el backdrop o swipe izquierda) y zona `[data-edge-swipe]` de 16px para abrirlo. El editor pasa a `pl-9 pr-4` en móvil (gutter del handle) y `sm:px-8 lg:px-14`; el atajo Ctrl K se oculta bajo 768px.
    - Sheets según el puntero (no el ancho): con `pointer: coarse` PageMenu/BlockMenu/StatusMenu/IconPicker/SlashMenu se renderizan como hoja inferior (mismo `data-*`), y con ratón siguen anclados y clampados (anchor-tracking intacto). `SearchPalette` a pantalla completa en móvil y `ConfirmDialog` con botones de 40px.
    - Gestos: long-press en el checkbox → `StatusMenu` (el tap sigue alternando done); long-press en fila de página → `PageMenu` o, si se mueve >8px, DnD con `touchmove` no-pasivo que bloquea el scroll; tap en el handle de bloque → `BlockMenu` y arrastre → reordenar con auto-scroll cerca de los bordes de `[data-editor-scroll]`; handles y acciones de página visibles siempre con `coarse:opacity-100`.
    - Desviaciones conscientes: multi-selección e indent/outdent siguen siendo solo de escritorio (sin Tab no hay alternativa táctil); sin swipe-para-cerrar sheets (backdrop/Escape) y el menú del bloque se abre con el handle (no long-press sobre el texto, que seleccionaría texto).
    - Tests: 202 unit sin cambios; `e2e/mobile.e2e.cjs` nuevo (30 checks: layout, drawer, edge swipe, sheets, long-press, drag de bloque/página, búsqueda full-screen) con contexto `hasTouch` **sin** `isMobile` (con `isMobile` el layout viewport pasa a 980px y `max-width: 768px` deja de aplicar). Regresión actual (2026-09-24): 457 checks E2E verdes.
11. **Futuro** (post-MVP) — rich text inline (segmentos con marcas), tablas, gráficas, export MD, sync
      - ✅ **Selección de texto entre bloques (2026-09-24)**: `caret.ts` traduce los puntos DOM a offsets por bloque y crea el rango con `setBaseAndExtent`; mouse-drag, Shift+clic sobre texto, Shift+↑/↓ (incluidas líneas visuales envueltas) y Ctrl+A seleccionan a través de contenteditables. `BlockList` intercepta `beforeinput`, resuelve pegado/copia/corte con `text/plain` propio y trata Enter; reemplazo, corte y borrado son atómicos en undo/autosave. Borrar solo el separador une los bloques. La multiselección de bloques se mantiene con Shift+clic en el espacio de fila o Ctrl/Cmd+Shift+clic sobre texto, y con Shift+↑/↓ en límites o sobre una selección de bloques. E2E `adv-selection`: 53 checks verdes; O2–O4 ya no quedan latentes. `text/html` permanece como mejora futura.
     - UI móvil pendiente: multi-selección táctil (modo selección), indent/outdent sin teclado, swipe-para-cerrar sheets y selector de idioma.

## 4. Estructura de carpetas

```
synapse/
├─ electron.vite.config.ts
├─ src/
│  ├─ shared/          # tipos Page/Block/api compartidos por main, preload y renderer
│  ├─ main/            # ventana, db/ (connection, schema, repositories), ipc/
│  ├─ preload/         # API tipada
│  └─ renderer/src/
│     ├─ editor/       # store, registry, transforms, focus  ← el corazón
│     ├─ blocks/       # componentes por tipo
│     ├─ i18n/         # catálogo en, t()/tList(), useTranslation
│     ├─ store/        # zustand (páginas, autosave)
│     └─ ui/           # sidebar, slash menu, búsqueda
├─ resources/          # iconos
├─ DESIGN.md           # sistema de diseño (Mocha Synapse)
└─ design/             # preview estático del DESIGN.md (html/css, no se empaqueta)
```

## 5. Riesgos conocidos

- **contenteditable quirks** (acentos/IME): mitigado con `compositionstart/end` (no se reescribe el DOM durante composición), `onInput` desacoplado de React y E2E con acentos (`canción ñandú`). Pendiente afinar `beforeinput` si aparecen IME problemáticos.
- **better-sqlite3 nativo en Electron**: better-sqlite3 v13 usa prebuilds N-API que cargan igual en Node y Electron, así que los tests de repositorios corren en `npm test` normal (el `postinstall` con `@electron/rebuild` es redundante pero inocuo).
- **Drag & drop con foco activo**: pointer events + placeholder, no HTML5 DnD nativo. El DnD de páginas usa el mismo patrón (umbral 4 px para no robar el clic de selección; en táctil arma con long-press de 450 ms y bloquea el scroll con un `touchmove` no-pasivo). Los handles de bloque usan `touch-action: none` y el arrastre hace auto-scroll cerca de los bordes del contenedor.
- **Selección entre bloques** (resuelta 2026-09-24): rango DOM sintético, reemplazo transaccional, `beforeinput`, clipboard `text/plain`, selección por ratón/teclado y borrado del separador; detalles y semántica de gestos en fase 11.

## 6. Verificación (agentes)

- **MCP de Playwright**: sí funciona en esta máquina vía wrapper (`~/.config/opencode/bin/playwright-mcp.sh`, Chromium bundled en headless, sin Chrome del sistema). Ideal para explorar/depurar; para regresión usar los runners Node, que son deterministas.
- **Escritura del MCP**: screenshots/snapshots solo dentro del workspace (`.playwright-mcp/` por defecto); para `/tmp/opencode` usar los runners Node (`page.screenshot`).
- **Hooks E2E en el DOM**: `[data-row-id]`, `[data-block-type]`, `[data-selected]`, `[data-checked]`, `[data-status]` (todo: `backlog|todo|in-progress|done|cancelled`), `[data-block-id]` (editable), `[data-todo-checkbox]`, `[data-status-box]` (visual del estado), `[data-status-menu]`, `[data-status-option="..."]` (`data-active`), `[data-block-handle]`, `[data-block-menu]`, `[data-menu-action]`, `[data-slash-menu]`, `[data-slash-item]` (`data-active`), `[data-drop-placeholder]`; páginas: `[data-page-id]`, `[data-page-depth]`, `[data-page-title]`, `[data-page-toggle]` (`data-expanded`), `[data-page-icon]`, `[data-page-action]`, `[data-page-rename]`, `[data-page-title-input]`, `[data-page-menu]`, `[data-page-dragging]`, `[data-page-drop="before|after|inside"]`, `[data-breadcrumb]`, `[data-breadcrumb-current]`, `[data-icon-button]`, `[data-icon-picker]`, `[data-icon-option]`, `[data-icon-remove]`, `[data-confirm-dialog]`, `[data-confirm-accept]`, `[data-confirm-cancel]`; búsqueda: `[data-search-trigger]`, `[data-search-trigger-top]`, `[data-search-palette]`, `[data-search-input]`, `[data-search-results]`, `[data-search-result]` (`data-kind`, `data-active`, `data-page-id`, `data-block-id`), `[data-search-group="pages|blocks"]`, `[data-search-empty]`, `[data-search-searching]`; theme: `[data-theme-toggle]` (contenedor con `data-theme-preference`) + `[data-theme-option="system|light|dark"]` y `<html data-theme="light|dark">` + clase `.dark`; móvil: `[data-sidebar]`, `[data-sidebar-toggle]`, `[data-sidebar-close]`, `[data-sidebar-backdrop]`, `[data-edge-swipe]`, `[data-sheet="block-menu|page-menu|status-menu|slash-menu|icon-picker"]`, `[data-sheet-backdrop]`.
- **Gestos en E2E**: el contexto móvil es `hasTouch: true` sin `isMobile` (el layout viewport debe seguir siendo 390px) y el long-press se emula despachando `PointerEvent` sintéticos con `pointerType: 'touch'` + `waitForTimeout(650)`; los `pointermove` de swipe/drag se despachan sobre el propio elemento (React) o sobre `window` según quién escuche. Ojo: `locator.boundingBox()` espera 30s si el elemento ya no existe; para "ya no está" usar `locator.count()`.
- **Lectura de texto en E2E**: el contenido usa un `<div>` por línea, así que hay que unir los hijos directos con `\n` (`:scope > div`) en vez de usar `textContent` a secas.
- **Mock IPC**: `e2e/mock-api.js` expone `window.__mockState()`, `window.__mockReset()` y `window.__calls`; persiste en `localStorage` bajo `__synapse_e2e_mock__` (sobrevive a `reload()`), así que se siembran páginas/bloques/settings escribiendo esa clave y recargando (ver helper `seed()` en `e2e/phase4.e2e.cjs` y `e2e/phase5.e2e.cjs`). El mock replica la semántica del repo a nivel de dominio: `remove` en cascada (hijos + bloques), `move` real con `position` como índice de inserción y renumber de ambos padres, `search.query` igual que el repo (páginas primero, `text` parseado, orden `updatedAt DESC → position → createdAt`, plegado solo-ASCII como `LIKE`) y `settings` persiste la preferencia de tema. La semántica canónica vive en `src/shared/domain.ts` (`comparePageOrder`, `collectDescendantIds`, `planPageMove`), usada por el repo y el renderer; el mock la lleva replicada (corre como script clásico vía `addInitScript`, sin resolución de módulos) y `tests/mockFidelity.test.ts` pinea mock ↔ repo (moves, cascada, búsqueda, ids únicos, guards `not found`). Cualquier cambio de semántica en la app debe reflejarse en la réplica del mock o esta suite falla.
- **Sidebar virtualizado** (`2026-09-24`): `flattenVisiblePageTree()` aplana solo los descendientes expandidos y `Sidebar` monta la ventana de filas de 30px con overscan 8; mantiene montadas la fila enfocada, renombrada, con menú abierto o implicada en DnD. La navegación revela también una página ya activa (`selectionVersion`), y Tab/Shift+Tab atraviesan filas no montadas. El DnD hace auto-scroll del nav con ratón y long-press táctil; los descendientes prohibidos se calculan una vez por arrastre, y `collectDescendantIds` usa una cola lineal. Hooks nuevos: `[data-page-nav]`, `[data-page-list]` (`data-page-count` total visible y `data-page-rendered` montadas) y `[data-page-index]`. Regresión: `e2e/sidebar-virtualization.e2e.cjs` (12 checks).
- **Benchmark de escalabilidad tras virtualizar**: las 18 combinaciones (3 perfiles × 6 tamaños) pasan sus SLO hasta 50.000 páginas; con 50.000, startup p95 baja de 14,4–17,6 s a 0,75–0,86 s y memoria agregada de 4,6–4,9 GiB a 639–664 MiB (~86% menos). La repetición final tras el ajuste de auto-scroll mantiene 26 filas montadas, startup p95 de 0,77–0,80 s y memoria de 652–659 MiB. Informe completo `/tmp/synapse-pages-stress-virtualized.json`; repetición final de 50.000 páginas `/tmp/synapse-pages-stress-virtualized-final-50k.json`.
- **Puerto**: el servidor E2E de `tests/vite.e2e.config.ts` usa el 5174 (el dev normal usa 5173).
- **Suites adversariales** (mismos requisitos que las oficiales): `node e2e/adv-phase4.e2e.cjs` (133 checks; usa `[data-slash-item][data-active="true"]`, no clases CSS, para el ítem activo) y `node e2e/adv-selection.e2e.cjs` (53 checks de selección/reemplazo; todos verdes).
- **CI (GitHub Actions)**: en cada push/PR a `main` corre `npm ci --ignore-scripts` + `npm run typecheck` + `npm test` (sección 10). Es la verificación mínima que hay que dejar verde en local antes de commitear; los E2E no corren en CI.

## 7. Convenciones de commits y flujo

- **Conventional Commits en inglés** (preferencia explícita del usuario): `<type>(<scope>): <subject>` en imperativo, minúscula inicial, sin punto final y ≤72 caracteres; cuerpo en inglés tras una línea en blanco con el qué y el porqué. No usar prefijos tipo `Phase N:`.
- Tipos usados: `feat`, `fix`, `refactor`, `test`, `build`, `chore`, `docs`. Scopes por área (`pages`, `search`, `theme`, `ui`, `editor`, `db`…).
- Historial reescrito el 2026-09-20 a este formato (9 commits, sin remoto de git). Mantener el formato hacia adelante.
- **Commit autónomo**: tras cualquier cambio (feature, fix, update, refactor…), si `npm run typecheck`, `npm test` y —si toca UI— los runners E2E pasan, commitear sin pedir permiso al usuario; basta con mencionarlo en la respuesta (hash y mensaje). Antes de commitear: `git status`/`git diff` limpios de lo no intencionado.
- Idioma: la conversación y este documento van en español; commits, código y tests en inglés.

## 8. Principios transversales (frontend)

- **Desacoplamiento frontend/backend**: el renderer nunca importa `electron` ni módulos `node:*`; todo su acceso a datos/sistema pasa por el contrato tipado `Api` (`src/shared/types.ts`) inyectado como `window.api` (hoy preload + IPC). Cualquier implementación alternativa del contrato (mock E2E, otro shell, futuro Android) debe poder sustituirse sin tocar `src/renderer/**`; al abordar un segundo shell, el parseo/validación de `src/main/ipc/registerIpc.ts:17-74` se extrae a `src/shared/` para reutilizarlo.
- **Compatibilidad móvil y responsive obligatoria**: toda UI nueva se diseña también para pantallas estrechas (<768px) y puntero táctil (`pointer: coarse`), no se adapta después: usar `useIsMobile`/`useTouchInput`, sheets en vez de popovers anclados con puntero grueso, targets ≥44px, gestos (`longPress`/`swipe`) y alternativa táctil a cada atajo de teclado o interacción solo-ratón. Base: fase 10 y sección "Responsive & touch" de `DESIGN.md`; pendientes táctiles en fase 11 (multi-selección, indent/outdent, cierre de sheets por swipe, selector de idioma).
- **Motivación**: un futuro APK Android reutilizando el renderer (Electron no corre en Android; se sustituye el shell y se implementa `Api` sobre el SQLite del sistema, p. ej. vía Capacitor). No es una fase comprometida, pero estas dos reglas son las que mantienen esa puerta abierta.

## 9. Deuda técnica y refactors (revisión 2026-09-22, pagada 2026-09-23)

Revisión de duplicación/patrones/desacoplamiento (code-reviewer). Todo el listado está pagado (2026-09-23, commits `44a9c9f`→`bcfbf12`); 220 unit + 431 checks E2E verdes (los 3 únicos fallos siguen siendo los latentes O2–O4 de `adv-selection`):

- **`src/shared/domain.ts`** (ya de la revisión anterior): fuente única de la semántica de dominio (`comparePageOrder`, `collectDescendantIds`, `planPageMove`) consumida por `pages.move` (repo), `pageTree.movePage` y `Sidebar`; el mock la replica y `tests/mockFidelity.test.ts` pinea mock ↔ repo (moves, cascada, búsqueda, ids únicos, guards).
- **`usePopoverDismiss` + envoltorio `Popover`** (`refactor(ui) ae84c6b`): `ui/usePopoverDismiss.ts` (pointerdown fuera → cerrar; Escape capture) + `ui/Popover.tsx` (portal + `useAnchoredPosition` + descarte + fork Sheet/portal). `BlockMenu`, `PageMenu`, `IconPicker` y `StatusMenu` solo declaran items/ancho/`data-*`; `SlashMenu` conserva su Escape (acoplado a ↑↓/Enter/Backspace en un listener). El pointerdown sobre el ancla sigue cerrando (semántica intacta).
- **`transforms.changeType` limpia `status`** (`fix(editor) 7625425`): convertir un todo a otro tipo descarta el status (antes persistía JSON basura); test que pinea la limpieza y la identidad same-type.
- **Registry declarativo** (`refactor(editor) 792c89e`): `BlockDefinition` gana `layout: 'text'|'boxed'|'divider'`, `prefixKind: 'none'|'bullet'|'todo'`, `hasStatus`, `appendsParagraph` y `softLineBreaks`; `BlockRow` renderiza por layout/prefix y `editorStore`/`transforms.splitBlock` ramifican por esos flags, no por tipos concretos. Añadir un bloque toca el registry + i18n + input rule, no condicionales esparcidas.
- **`editor/persistence.ts` + `mutate()`** (`refactor(editor) 005418f`): la persistencia (diff contra `persisted`, `flushQueue`/`loadQueue`, autosave debounced, cargas canceladas, foco pendiente) vive en `createPersistence(hooks)` con inyección de `window.api`; `editorStore` queda con estado UI y acciones. `mutate(blocks, focus?, selection?)` unifica `clearSelection + pushHistory + lastTextEdit = null` (13 acciones; `duplicateBlocks` pasa su selección, `setText` conserva su coalescencia). Sin cambio de comportamiento: la suite de `editorStore` pasó intacta.
- **Rechazos de IPC gestionados** (`fix(editor) af712f7`): `loadError` en `editorStore` (list/create fallidos para la página activa); `BlockList` renderiza error + retry (`blocks.loadError`/`blocks.retry`, `data-load-retry`) y hace `.catch` en sus `loadPage`; `deletePage` hace el `await editor.flush()` dentro del `try` (fallo → restaura cargas, log y no borra); el timer de autosave traga su rechazo. Tests: fallo de carga/creación/reset y `deletePage` con flush rechazado.
- **Batch `blocks:sync`** (`feat(db) 454d540`): `sync(pageId, { upserts, removeIds })` transaccional en el repo (removes + insert-or-update + positions), handler IPC + preload + tipo `BlockSyncInput` en `shared/types`; el flush difa contra `persisted` y envía UNA llamada (con dirty-check, `sync` no se invoca si nada cambió) y reconstruye `persisted` de las filas devueltas. El mock replica la semántica y `mockFidelity` pinea mock ↔ repo (upserts mixtos, `removeIds` desconocidos, guard cross-page). El runner `phase3` reescribió sus 8 checks de autosave para inspeccionar el payload `sync` (mismo conteo, 42).
- **`ui/usePageDrag.ts`** (`refactor(ui) 0006924`): la máquina de DnD de páginas (~180 líneas) sale de `Sidebar.tsx` (drag, long-press, zonas, auto-expand, bloqueo de scroll, drop, Escape); devuelve `drag`, `handleDragPointerDown`, `suppressClickRef` e `isBusy`. `DRAG_THRESHOLD_PX`/`TOUCH_DRAG_THRESHOLD_PX` se exportan de allí y `BlockList` los importa.
- **`createDebouncer`** (`refactor(shared) 120b1dc`): `src/shared/debounce.ts` (`schedule`/`cancel`) unifica el autosave (400 ms), los renames por página (Map de debouncers, 500 ms) y el debounce de búsqueda (120 ms).
- **IPC robusto** (`refactor(ipc) bcfbf12`): `requireObject` lanza error descriptivo si el payload llega `undefined` (antes TypeError por destructuring); `settings:set` ya no hardcodea el tema — `registerIpc(db, { onSettingChanged })` y `main/index.ts` posee el wiring de `applyThemePreference`.
- **Sidebar virtualizado** (2026-09-24): aplanado de las filas expandidas, virtualización fija de 30px/overscan 8, foco accesible a través de filas fuera de ventana y auto-scroll de DnD para ratón/táctil. Los descendientes prohibidos se cachean por arrastre y `collectDescendantIds` evita `Array.shift()`. Tests: 230 unit y nuevo `e2e/sidebar-virtualization.e2e.cjs` (12 checks); las suites existentes de páginas, DnD, móvil, popovers y búsqueda pasan.
- **Lo que está bien y no tocar**: `transforms.ts` puro con identidad estable, el contrato `Api` + preload fino, `shared/content.ts` como único punto de serialización, repos SQLite consistentes (prepared statements + transacciones), `rectAnchor.ts` genérico (base del `Popover`).

## 10. Repositorio público y CI

- **Repo**: `https://github.com/ToguDV/synapse` (público, rama `main`), licencia **MIT** (`LICENSE`) con `THIRD_PARTY_NOTICES.md` para las fuentes OFL (Inter, JetBrains Mono, Noto Color Emoji). El `README.md` (en inglés, con capturas) documenta features, stack, arquitectura, setup, tests, build y roadmap; `AGENTS.md` y `DESIGN.md` siguen en español y se enlazan desde ahí.
- **CI**: `.github/workflows/ci.yml` (GitHub Actions), job `unit` en push/PR a `main`: `ubuntu-latest` + Node 24, `npm ci --ignore-scripts` (no descarga Electron ni recompila better-sqlite3: los tests usan los prebuilds N-API del paquete), `npm run typecheck` y `npm test` (verificado en limpio en el contenedor). Los E2E no corren en CI por ahora; si se añaden, `e2e/playwright.cjs` ya los hace portables (dep local → `SYNAPSE_PLAYWRIGHT` → caché de npx).
- **Reglas**: no romper la CI — es la misma verificación mínima que hay que dejar verde en local antes de commitear; el badge del README apunta a `ci.yml`, así que renombrar el workflow o el job obliga a actualizarlo. `gh` está autenticado como `ToguDV` en esta máquina.
- **Metadatos**: `package.json` lleva `license: MIT`, `repository`/`bugs`/`keywords`/`engines` (Node ≥24); `electron-builder.yml` usa el maintainer `ToguDV <ToguDV@users.noreply.github.com>`.
- **Capturas**: `docs/media/*.png` se regeneran con `node e2e/screenshots.cjs` (requiere el server E2E en 5174) y están referenciadas en el README.
