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
