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
- E2E (Playwright, headless, sin Electron): sirve solo el renderer en el contenedor y lanza los runners desde el host (usan el Chromium cacheado en `~/.npm/_npx`):
  ```bash
  docker compose run -d --rm --name synapse-e2e dev npx vite --config tests/vite.e2e.config.ts
  node e2e/phase3.e2e.cjs && node e2e/phase4.e2e.cjs   # 42 y 53 checks
  docker stop synapse-e2e
  ```

## 1. Stack decidido

| Capa | Elección |
|---|---|
| Shell | Electron + **electron-vite** (scaffold/HMR) + **electron-builder** (empaquetado) |
| UI | React 18 + TypeScript strict + **Tailwind** |
| Estado | **Zustand** |
| Datos | **SQLite local** (better-sqlite3 en proceso main) — offline-first |
| Editor | **Propio, arquitectura por-bloque** (cada bloque = componente React con su `contenteditable`) |
| Tests | Vitest (transformaciones, store y repositorios) + Playwright (E2E del renderer con `api` mockeada) |

## 2. Arquitectura

**Procesos:**
- **Main (Node)**: ventana, SQLite (esquema + repositorios), handlers IPC, búsqueda
- **Preload**: `contextBridge` con API tipada (`api.pages.*`, `api.blocks.*`) — `contextIsolation: true`, `nodeIntegration: false`, sandbox
- **Renderer (React)**: la app y el editor

**Modelo de datos (SQLite):**
- `pages` — id, title, parent_id, icon, position, timestamps (páginas anidadas)
- `blocks` — id, page_id, type, **content JSON**, position, indent, timestamps
- Lista **plana con indent** (como Notion real): mucho más simple que árbol para mover/fusionar

**Núcleo del editor (lo que aprendes de verdad):**
- `BlockRegistry` (`editor/registry.ts`): fuente única `type → { label, icon, keywords, placeholder, textClasses, continuation, textual }`; extensible a tablas/gráficas en el futuro.
- `transformaciones puras y testeables`: `split`, `merge`, `indent`, `outdent`, `move`, `changeType`, `duplicate`, `removeBlocks`, `insertAfter`
- `FocusManager`: caret por bloque, navegación con flechas, Enter/Backspace/Tab
- Undo/redo a nivel de bloque (snapshot de la lista)

**UI:** sidebar de páginas + editor; slash menu `/`; handle de bloque (menú + drag & drop); búsqueda global `Ctrl+K`; autosave debounced vía IPC.

## 3. Fases

1. **Scaffold** — electron-vite, TS, Tailwind, Zustand, config builder, seguridad IPC. ✅ HMR funciona
2. **Persistencia** — esquema SQLite, repositorios, IPC CRUD tipado, autosave. ✅ página por defecto, rename con autosave y persistencia verificada entre reinicios
   - ✅ **Tests implementados** en `tests/persistence.test.ts` (12 tests, corren en `npm test`).
   - Nota: better-sqlite3 v13 trae prebuilds N-API (`lib/linux-x64.js` → `prebuilds/linux-x64.node`), así que el mismo binario carga bajo Node/vitest y bajo Electron: ya no hace falta `ELECTRON_RUN_AS_NODE`.
3. **Núcleo del editor** ✅ — párrafo editable, foco/caret entre bloques, transformaciones puras + tests, undo/redo.
   - `editor/transforms.ts`: `split`, `merge` (con anterior/siguiente), `indent` (máx. prev+1), `outdent`, `move`, `changeType`; puros y con identidad estable (misma referencia si no hay cambio).
   - `editor/editorStore.ts`: Zustand con lista plana, `focusRequest` con nonce, autosave debounced que sincroniza altas/bajas/updates/orden contra IPC, undo/redo por snapshots (coalescencia de tecleo 600 ms, límite 200).
   - `editor/caret.ts` + `blocks/*`: `contenteditable` por bloque, Enter (split), Shift+Enter/code (salto de línea), Backspace en offset 0 (merge o heading→paragraph), Delete al final (merge), Tab/Shift+Tab, flechas arriba/abajo en los bordes.
   - Tests: 61 unit (transforms + store + repos) y 42 checks E2E (`e2e/phase3.e2e.cjs` con `tests/vite.e2e.config.ts`; el dev server del renderer se sirve con `npx vite --config tests/vite.e2e.config.ts` porque `electron-vite dev --rendererOnly` igual lanza Electron en v5).
4. **Bloques y UX Notion** ✅ — heading, bullet, todo, code, quote, divider; slash menu; handle + drag & drop; multi-selección
   - `editor/registry.ts`: fuente única por tipo (`label`, `icon`, `keywords`, `placeholder`, `textClasses`, `continuation`, `textual`); `BlockRow` ya no duplica estilos.
   - `editor/commands.ts`: reglas markdown puras (`# `, `- `, `[] `, `> `, ` ``` `, `---`) y `filterSlashCommands`; `editor/content.ts` serializa `{ text, checked? }` con compatibilidad hacia atrás.
   - `ui/SlashMenu.tsx` (anclado al caret, ↑↓/Enter/Esc) y `ui/BlockMenu.tsx` + `blocks/BlockHandle.tsx` (convertir/duplicar/mover/eliminar).
   - Drag & drop con pointer events + placeholder en flujo e indent por posición X; multi-selección con Shift+click/Shift+flechas, Backspace y Ctrl+D sobre la selección; checkbox real en `todo`.
   - Nota: el placeholder del drag desplaza las filas ~6 px, así que el destino de soltado debe superar el punto medio ya desplazado de la fila.
   - Nota: los saltos de línea se representan como un `<div>` por línea (no como `\n` dentro de un nodo de texto: Chromium teclea antes del salto); `caret.ts` expone `readPlainText`/`writePlainText`/`insertPlainText` para leer y escribir ese DOM. Los divisores se saltan al elegir foco y al fusionar (`nearestTextualBlock`).
   - Tests: 115 unit (transforms + store + commands + repos) y 53 checks E2E (`e2e/phase4.e2e.cjs`, mismos comandos que la fase 3). Suites adversariales de regresión: `e2e/adv-phase4.e2e.cjs` (125 checks) y `e2e/adv-selection.e2e.cjs` (selección/reemplazo).
5. **Páginas** — sidebar con árbol, crear/renombrar/borrar, breadcrumbs, iconos
6. **Búsqueda y pulido** — Ctrl+K, theme, empaquetado con electron-builder
7. **Futuro** (post-MVP) — rich text inline (segmentos con marcas), tablas, gráficas, export MD, sync

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
│     ├─ store/        # zustand (páginas, autosave)
│     └─ ui/           # sidebar, slash menu, búsqueda
└─ resources/          # iconos
```

## 5. Riesgos conocidos

- **contenteditable quirks** (acentos/IME): mitigado con `compositionstart/end` (no se reescribe el DOM durante composición), `onInput` desacoplado de React y E2E con acentos (`canción ñandú`). Pendiente afinar `beforeinput` si aparecen IME problemáticos.
- **better-sqlite3 nativo en Electron**: better-sqlite3 v13 usa prebuilds N-API que cargan igual en Node y Electron, así que los tests de repositorios corren en `npm test` normal (el `postinstall` con `@electron/rebuild` es redundante pero inocuo).
- **Drag & drop con foco activo**: pointer events + placeholder, no HTML5 DnD nativo
- **Selección DOM multi-bloque**: Chromium la clampa al editing host, así que `insertPlainText` solo reemplaza dentro del bloque de inicio; si en el futuro se añade select-all a nivel documento habrá que extender `offsetAt`/`insertPlainText` a rangos que crucen bloques.

## 6. Verificación (agentes)

- **MCP de Playwright**: sí funciona en esta máquina vía wrapper (`~/.config/opencode/bin/playwright-mcp.sh`, Chromium bundled en headless, sin Chrome del sistema). Ideal para explorar/depurar; para regresión usar los runners Node, que son deterministas.
- **Escritura del MCP**: screenshots/snapshots solo dentro del workspace (`.playwright-mcp/` por defecto); para `/tmp/opencode` usar los runners Node (`page.screenshot`).
- **Hooks E2E en el DOM**: `[data-row-id]`, `[data-block-type]`, `[data-selected]`, `[data-checked]`, `[data-block-id]` (editable), `[data-todo-checkbox]`, `[data-block-handle]`, `[data-block-menu]`, `[data-menu-action]`, `[data-slash-menu]`, `[data-slash-item]`, `[data-drop-placeholder]`.
- **Lectura de texto en E2E**: el contenido usa un `<div>` por línea, así que hay que unir los hijos directos con `\n` (`:scope > div`) en vez de usar `textContent` a secas.
- **Mock IPC**: `e2e/mock-api.js` expone `window.__mockState()`, `window.__mockReset()` y `window.__calls`; persiste en `localStorage` bajo `__synapse_e2e_mock__` (sobrevive a `reload()`), así que se siembran bloques escribiendo esa clave y recargando (ver helper `seed()` en `e2e/phase4.e2e.cjs`).
- **Puerto**: el servidor E2E de `tests/vite.e2e.config.ts` usa el 5174 (el dev normal usa 5173).
- **Suites adversariales** (mismos requisitos que las oficiales): `node e2e/adv-phase4.e2e.cjs` (125 checks) y `node e2e/adv-selection.e2e.cjs` (selección/reemplazo; sus 3 únicos fallos son el caso latente de selección DOM multi-bloque, no reproducible por UI).
