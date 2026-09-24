# Stress benchmark: cantidad de páginas

Este benchmark lanza el **AppImage real** con SQLite real. La base se genera de
forma determinista bajo `/tmp` dentro del contenedor `dev`; nunca usa ni modifica
`data/synapse.db` ni el perfil habitual de Synapse. El renderer E2E con mock no
participa en estas mediciones.

## Ejecutar

```bash
docker compose run --rm builder npm run dist:linux
docker compose up -d dev
npm run bench:pages
```

El contenedor `dev` debe permanecer activo. El runner abre la app dentro de
Xvfb (1280×800), así que no roba el foco ni abre ventanas en el escritorio. La
configuración Docker desactiva la GPU; los tiempos describen este entorno Linux
con renderizado por software y no deben extrapolarse directamente a otros
equipos.

Por defecto se prueban 100, 1.000, 5.000, 10.000, 20.000 y 50.000 páginas,
con tres perfiles:

- `flat-fixed`: páginas raíz y dos bloques en total; aísla el coste de páginas.
- `flat-per-page`: páginas raíz y un bloque por página; estresa también la
  búsqueda del contenido.
- `tree-per-page`: árbol balanceado de hasta diez hijos por página y un bloque
  por página.

Cada conjunto de datos se abre en tres procesos nuevos. En la primera apertura
se ejecutan 30 llamadas por término a `window.api.search.query` y 10 muestras
de UI para resultados frecuentes y sin coincidencias. Se mide también la
navegación desde un resultado de página y uno de bloque. El runner avanza por
tamaño hasta 50.000 o hasta un fallo/timeout de la app.

El benchmark informa mediana y p95. Los criterios iniciales de “usable” son:

- editor y ventana virtual visible del sidebar listos en p95 ≤ 3 s, medidos
  desde el inicio del módulo main de la app; el reporte incluye el total de
  páginas visibles y las filas montadas en el DOM;
- resultados visibles en p95 ≤ 1 s, incluyendo el debounce de búsqueda actual
  (120 ms).

Los resultados también muestran el tiempo desde el comando de lanzamiento hasta
el editor listo. Ese valor incluye Docker, Xvfb y `--appimage-extract-and-run`,
por lo que se reporta aparte y no se usa para el umbral de 3 s. `ready-to-show`,
`pages:list`, `blocks:list`, búsqueda en main, navegación, memoria de procesos
Electron, errores del renderer, páginas del árbol y filas virtualizadas del
sidebar quedan incluidos en el JSON. La memoria reportada suma los working sets
de los procesos Electron; puede contar páginas compartidas más de una vez.

```bash
# Smoke pequeño del harness
npm run bench:pages -- --sizes 100 --profiles flat-fixed --startup-runs 1 --query-runs 2 --ui-runs 2

# Repetir solo el rango alto con más muestras
npm run bench:pages -- --sizes 10000,20000,50000 --profiles flat-per-page --startup-runs 5 --query-runs 50 --ui-runs 20 --report /tmp/pages-high-load.json
```

El reporte predeterminado es `/tmp/synapse-pages-stress-report.json`. Los
datasets temporales se eliminan al terminar el runner, incluso si falla un
perfil.

## Resultados de la virtualización (2026-09-24)

Barrido en Linux con AppImage y SQLite reales, Xvfb 1280×800 y renderizado por
software. Las 18 combinaciones (3 perfiles × 6 tamaños) pasaron sus SLO. Comparación
antes/después en 100 y 50.000 páginas:

| Perfil | Páginas | Inicio p95 antes → después | Working set agregado antes → después |
|---|---:|---:|---:|
| `flat-fixed` | 100 | 383 → 375 ms | 537 → 524 MiB |
| `flat-per-page` | 100 | 377 → 384 ms | 541 → 523 MiB |
| `tree-per-page` | 100 | 403 → 376 ms | 537 → 526 MiB |
| `flat-fixed` | 50.000 | 16,05 → 0,77 s | 4.689 → 652 MiB |
| `flat-per-page` | 50.000 | 17,61 → 0,77 s | 4.657 → 656 MiB |
| `tree-per-page` | 50.000 | 14,42 → 0,80 s | 4.898 → 659 MiB |

En los perfiles de 50.000 páginas se montaron 26 filas del sidebar; la búsqueda
visible quedó en p95 de 223–234 ms. La memoria de la tabla suma los working sets
de los procesos Electron y puede contar páginas compartidas más de una vez. El
reporte completo del barrido y la repetición final de 50.000 páginas se guardaron
en `/tmp/synapse-pages-stress-virtualized.json` y
`/tmp/synapse-pages-stress-virtualized-final-50k.json`, respectivamente.
