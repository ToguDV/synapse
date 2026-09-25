#!/usr/bin/env bash
#
# Entorno y ejecución de las suites E2E de Synapse (Playwright contra el renderer).
#
# Por qué existe este script
# --------------------------
# Los runners de `e2e/*.cjs` necesitan dos cosas que el `docker compose` de
# desarrollo da por hechas, pero que en un contenedor Linux pelado (sin root, sin
# systemd y sin fuentes del sistema) no están: las bibliotecas compartidas que
# Chromium enlaza y, sobre todo, **fuentes instaladas**. Sin fuentes, Chromium
# arranca igual pero mide el texto con alto 0 y los E2E fallan de forma engañosa
# ("waiting for locator(...) to be visible" cuando el elemento existe y tiene
# contenido). Este script detecta ese caso, prepara un sysroot local la primera
# vez (descargando paquetes Debian y extrayéndolos sin privilegios) y ejecuta las
# suites con el entorno correcto.
#
# Uso
# ---
#   ./e2e/run.sh doctor          # diagnóstico: deps, playwright, libs, fuentes, vite
#   ./e2e/run.sh env             # prepara el sysroot local (idempotente)
#   ./e2e/run.sh                 # todas las suites
#   ./e2e/run.sh phase3 mobile   # solo las suites indicadas
#
# Variables
# ---------
#   SYNAPSE_E2E_CACHE   directorio de caché (por defecto: .cache/e2e, ignorado por git)
#   SYNAPSE_SYSROOT     sysroot ya existente que reutilizar (p. ej. /tmp/sysroot)
#   SYNAPSE_PLAYWRIGHT  la respeta `e2e/playwright.cjs`
#   SYNAPSE_E2E_PORT    puerto del dev server (por defecto: 5174; se propaga a
#                       vite con --port y a los runners con la misma variable)
#
# En una máquina normal (con fuentes y libs del sistema) todo esto es un no-op:
# el script comprueba que Chromium arranca y que el texto se mide, y se salta la
# preparación.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="${SYNAPSE_E2E_CACHE:-$ROOT/.cache/e2e}"
SYSROOT="$CACHE/sysroot"
LIBDIR="$SYSROOT/lib"
FONTDIR="$CACHE/fonts"
FONTCONF="$CACHE/fonts.conf"
PORT="${SYNAPSE_E2E_PORT:-5174}"
export SYNAPSE_E2E_PORT="$PORT"
URL="http://localhost:$PORT/"
VITE_LOG="$CACHE/vite.log"
VITE_STARTED_BY_US=no

RUNNERS=(
  phase3 phase4 phase5 phase6 theme anchor-tracking page-dnd mobile
  sidebar-virtualization adv-phase4 adv-selection
)

# Módulos que Chromium carga con dlopen (no aparecen en `ldd`, así que la
# detección de libs no los ve). Sin libsoftokn3.so, NSS aborta el proceso con
# "FATAL:crypto/nss_util.cc" cuando se lanza chromium sin --password-store=basic.
DLOPEN_MODULES=(libsoftokn3.so libfreebl3.so libfreeblpriv3.so libnssckbi.so libnssdbm3.so)

# Paquetes Debian que aportan las bibliotecas que enlaza Chromium. Se generaron
# resolviendo cada `ldd` de chrome/chrome-headless-shell contra el índice
# `Contents-amd64.gz` de bookworm/main (se descartan los proveedores alternativos
# como firefox-esr o thunderbird, que traen copias de las mismas libs):
#
#   zcat Contents-amd64.gz | awk '$1 ~ /(libglib|libnss3|...)/ { print $1, $2 }'
#
# `doctor` lista las libs que falten y `env` descarga sólo los paquetes
# necesarios, así que la lista puede quedarse larga sin coste.
DEB_PACKAGES=(
  libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libavahi-client3
  libavahi-common3 libcairo2 libcups2 libdatrie1 libdbus-1-3 libdrm2
  libfontconfig1 libfreetype6 libfribidi0 libgbm1 libglib2.0-0 libgraphite2-3
  libharfbuzz0b libnspr4 libnss3 libpango-1.0-0 libpixman-1-0 libpng16-16
  libthai0 libwayland-server0 libx11-6 libxau6 libxcb-render0 libxcb-shm0
  libxcb1 libxcomposite1 libxdamage1 libxdmcp6 libxext6 libxfixes3 libxi6
  libxkbcommon0 libxrandr2 libxrender1
  fonts-liberation
)

# Mapa .so -> paquete, para pedir a apt sólo lo que falta de verdad.
LIB_TO_PACKAGE=(
  'libasound.so.2 libasound2'
  'libatk-1.0.so.0 libatk1.0-0'
  'libatk-bridge-2.0.so.0 libatk-bridge2.0-0'
  'libatspi.so.0 libatspi2.0-0'
  'libavahi-client.so.3 libavahi-client3'
  'libavahi-common.so.3 libavahi-common3'
  'libcairo.so.2 libcairo2'
  'libcups.so.2 libcups2'
  'libdatrie.so.1 libdatrie1'
  'libdbus-1.so.3 libdbus-1-3'
  'libdrm.so.2 libdrm2'
  'libfontconfig.so.1 libfontconfig1'
  'libfreetype.so.6 libfreetype6'
  'libfribidi.so.0 libfribidi0'
  'libgbm.so.1 libgbm1'
  'libgio-2.0.so.0 libglib2.0-0'
  'libglib-2.0.so.0 libglib2.0-0'
  'libgmodule-2.0.so.0 libglib2.0-0'
  'libgobject-2.0.so.0 libglib2.0-0'
  'libgraphite2.so.3 libgraphite2-3'
  'libharfbuzz.so.0 libharfbuzz0b'
  'libnspr4.so libnspr4'
  'libnss3.so libnss3'
  'libnssutil3.so libnss3'
  'libpango-1.0.so.0 libpango-1.0-0'
  'libpixman-1.so.0 libpixman-1-0'
  'libplc4.so libnspr4'
  'libplds4.so libnspr4'
  'libpng16.so.16 libpng16-16'
  'libsmime3.so libnss3'
  'libthai.so.0 libthai0'
  'libwayland-server.so.0 libwayland-server0'
  'libX11.so.6 libx11-6'
  'libXau.so.6 libxau6'
  'libXcomposite.so.1 libxcomposite1'
  'libXdamage.so.1 libxdamage1'
  'libXdmcp.so.6 libxdmcp6'
  'libXext.so.6 libxext6'
  'libXfixes.so.3 libxfixes3'
  'libXi.so.6 libxi6'
  'libxkbcommon.so.0 libxkbcommon0'
  'libXrandr.so.2 libxrandr2'
  'libXrender.so.1 libxrender1'
  'libxcb-render.so.0 libxcb-render0'
  'libxcb-shm.so.0 libxcb-shm0'
  'libxcb.so.1 libxcb1'
)

# ---------------------------------------------------------------- utilidades ---

c_ok() { printf '\033[32m%s\033[0m' "$1"; }
c_bad() { printf '\033[31m%s\033[0m' "$1"; }
c_dim() { printf '\033[2m%s\033[0m' "$1"; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
note() { printf '    %s\n' "$1"; }
fail() { printf '%s %s\n' "$(c_bad 'ERROR')" "$1" >&2; }

mkdir -p "$CACHE"

# Ruta del binario de Chromium que usará Playwright (el resolver del repo).
chrome_bin() {
  node -e "console.log(require('$ROOT/e2e/playwright.cjs').chromium.executablePath())" 2>/dev/null
}

# Libs que el enlazador dinámico no encuentra para el binario de Chromium.
missing_libs() {
  local bin="$1"
  [ -x "$bin" ] || return 0
  ldd "$bin" 2>/dev/null | awk '/not found/ { print $1 }' | sort -u
}

# Chromium arranca de verdad, tal y como lo lanzan las suites (Playwright) y con
# una medición del alto real del texto: los dos fallos del entorno (libs y fuentes)
# se manifiestan aquí, y el de fuentes es el que da errores engañosos.
probe_chromium() {
  PROBE_LAUNCH=0
  PROBE_HEIGHT=0
  cat > "$CACHE/probe.cjs" <<JS
// Generado por e2e/run.sh — sonda del entorno de Chromium.
const { chromium } = require('$ROOT/e2e/playwright.cjs')
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent('<div id=x style="font-size:24px;line-height:normal;font-family:Inter,system-ui,sans-serif">Hola \u00f1and\u00fa</div>')
  // Medición dependiente de los glifos (no de la caja de línea): con un
  // line-height fijo el div mediría 30px aun sin fuentes instaladas, así que
  // la sonda no distinguiría el fallo real (texto con alto 0).
  const height = await page.evaluate(() => {
    const el = document.getElementById('x')
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getBoundingClientRect().height
  })
  await browser.close()
  console.log('launch=1 text_height=' + Math.round(height))
})().catch((error) => {
  console.error(String((error && error.message) || error).split('\n')[0])
  console.log('launch=0 text_height=0')
})
JS
  local out
  out="$(timeout 120 node "$CACHE/probe.cjs" 2> "$CACHE/probe.log" | tail -1)"
  case "$out" in
    launch=1*) PROBE_LAUNCH=1 ;;
  esac
  local height="${out##*text_height=}"
  case "$height" in '' | *[!0-9]*) height=0 ;; esac
  PROBE_HEIGHT="$height"
}

# ------------------------------------------------------------------ sysroot ---

apt_get() {
  apt-get \
    -o Dir::State::lists="$CACHE/apt/lists" \
    -o Dir::Cache::archives="$CACHE/apt/archives" \
    -o Debug::NoLocking=1 "$@"
}

# Escribe un fonts.conf propio: el contenedor no trae /etc/fonts/fonts.conf y el
# fontconfig del sistema no ve las fuentes extraídas.
write_fonts_conf() {
  cat > "$FONTCONF" <<XML
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>$FONTDIR</dir>
  <dir>~/.fonts</dir>
  <dir>~/.local/share/fonts</dir>
  <cachedir>$CACHE/fontconfig</cachedir>
</fontconfig>
XML
}

# Extrae los .deb descargados y copia a $LIBDIR sólo las libs que faltaban (así
# no se ensombrecen las del sistema con versiones paralelas).
extract_debs() {
  local debs=("$@") deb
  mkdir -p "$SYSROOT/root" "$LIBDIR"
  for deb in "${debs[@]}"; do
    dpkg -x "$deb" "$SYSROOT/root" || return 1
  done
}

copy_missing_libs() {
  local wanted=("$@") name src copied=0 missing_from_debs=()
  for name in "${wanted[@]}"; do
    # Ojo: en los .deb las libs versionadas son symlinks (libFoo.so.1 ->
    # libFoo.so.1.2.3), por eso no se filtra por -type f; cp -L dereferencia.
    src="$(find "$SYSROOT/root" -name "$name" -print -quit 2>/dev/null)"
    if [ -n "$src" ]; then
      cp -Lf "$src" "$LIBDIR/$name"
      copied=$((copied + 1))
    else
      missing_from_debs+=("$name")
    fi
  done
  if [ "${#missing_from_debs[@]}" -gt 0 ]; then
    printf '    %s\n' "$(c_dim "sin fichero en los .deb: ${missing_from_debs[*]}")"
  fi
  [ "$copied" -gt 0 ]
}

use_sysroot_env() {
  export LD_LIBRARY_PATH="$LIBDIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  export FONTCONFIG_FILE="$FONTCONF"
  export FONTCONFIG_PATH="$CACHE"
}

# Reutiliza un sysroot ya preparado (SYNAPSE_SYSROOT) si con él Chromium arranca:
# evita descargar nada cuando el entorno ya lo trae hecho.
reuse_sysroot() {
  local dir="${SYNAPSE_SYSROOT:-}" bin path
  [ -n "$dir" ] && [ -d "$dir" ] || return 1
  bin="$(chrome_bin)" || return 1
  path="$dir/usr/lib/x86_64-linux-gnu:$dir/lib/x86_64-linux-gnu:$dir/lib"
  LD_LIBRARY_PATH="$path${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
    timeout 30 "$bin" --headless --no-sandbox --disable-gpu --dump-dom about:blank \
    > /dev/null 2>&1 || return 1
  export LD_LIBRARY_PATH="$path${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  note "reutilizando SYNAPSE_SYSROOT=$dir"
  return 0
}

# ¿Trae el host fuentes usables sin nuestro sysroot? Sondea Chromium sin los
# overrides propios de fontconfig: si el texto se mide, no hace falta descargar
# fonts-liberation (evita depender de apt/red en máquinas normales u offline).
system_fonts_usable() {
  local saved_file="${FONTCONFIG_FILE:-}" saved_path="${FONTCONFIG_PATH:-}"
  unset FONTCONFIG_FILE FONTCONFIG_PATH
  probe_chromium
  local usable=1
  [ "$PROBE_LAUNCH" -eq 1 ] && [ "$PROBE_HEIGHT" -gt 0 ] || usable=0
  if [ -n "$saved_file" ]; then
    export FONTCONFIG_FILE="$saved_file"
  else
    unset FONTCONFIG_FILE
  fi
  if [ -n "$saved_path" ]; then
    export FONTCONFIG_PATH="$saved_path"
  else
    unset FONTCONFIG_PATH
  fi
  [ "$usable" -eq 1 ]
}

# Prepara el sysroot local: descarga (sin root) sólo los paquetes que aportan las
# libs que falten e itera hasta que no falte ninguna (una lib ausente impide
# resolver sus propias dependencias, de ahí el bucle).
prepare_env() {
  local bin round=1 missing pkgs deb
  bin="$(chrome_bin)"
  if [ -z "$bin" ]; then
    fail "Playwright no resoluble. Instálalo o calienta la caché de npx."
    note "  npm i -D playwright          # o bien:"
    note "  npx playwright --version"
    return 1
  fi
  if [ ! -x "$bin" ]; then
    fail "Falta el navegador de Playwright en $bin"
    note "  npx playwright install chromium"
    return 1
  fi

  step "Bibliotecas de Chromium"
  if [ -z "$(missing_libs "$bin")" ]; then
    note "$(c_ok 'ya están todas') ($(basename "$bin"))"
  elif reuse_sysroot; then
    note "$(c_ok 'completas') vía SYNAPSE_SYSROOT"
  else
    if ! command -v apt-get > /dev/null || ! command -v dpkg > /dev/null; then
      fail "Faltan libs y no hay apt-get/dpkg para traerlas:"
      missing_libs "$bin" | sed 's/^/    /'
      note "  solución con root: npx playwright install-deps"
      return 1
    fi
    use_sysroot_env
    while :; do
      missing="$(missing_libs "$bin")"
      [ -z "$missing" ] && break
      if [ "$round" -gt 4 ]; then
        fail "Siguen faltando libs tras $round rondas:"
        echo "$missing" | sed 's/^/    /'
        return 1
      fi
      note "ronda $round: faltan $(echo "$missing" | wc -l | tr -d ' ') libs"
      pkgs=()
      for deb in "${LIB_TO_PACKAGE[@]}"; do
        set -- $deb
        if echo "$missing" | grep -qx -- "$1"; then
          case " ${pkgs[*]-} " in *" $2 "*) ;; *) pkgs+=("$2") ;; esac
        fi
      done
      [ "${#pkgs[@]}" -eq 0 ] && {
        fail "Sin paquete conocido para:"
        echo "$missing" | sed 's/^/    /'
        return 1
      }
      mkdir -p "$CACHE/apt/lists" "$CACHE/apt/archives"
      if [ ! -f "$CACHE/apt/.updated" ]; then
        note "apt-get update (listas propias, sin root)"
        apt_get update > "$CACHE/apt/update.log" 2>&1 ||
          { fail "apt-get update falló, ver $CACHE/apt/update.log"; return 1; }
        touch "$CACHE/apt/.updated"
      fi
      ( cd "$CACHE/apt/archives" && apt_get download "${pkgs[@]}" >> "$CACHE/apt/download.log" 2>&1 ) || {
        fail "apt-get download falló, ver $CACHE/apt/download.log"
        return 1
      }
      extract_debs "$CACHE/apt/archives"/*.deb || { fail "dpkg -x falló"; return 1; }
      copy_missing_libs $missing || {
        fail "ninguna lib copiada en la ronda $round"
        return 1
      }
      round=$((round + 1))
    done
    note "$(c_ok 'preparadas') en $LIBDIR"
  fi

  # Módulos dlopen: sin ellos NSS aborta al arrancar sin los flags de Playwright.
  local module src dlopened=0
  for module in "${DLOPEN_MODULES[@]}"; do
    [ -f "$LIBDIR/$module" ] && continue
    src="$(find "$SYSROOT/root" -name "$module" -print -quit 2>/dev/null)"
    [ -n "$src" ] && { cp -Lf "$src" "$LIBDIR/$module"; dlopened=$((dlopened + 1)); }
  done
  if [ "$dlopened" -gt 0 ]; then
    note "módulos dlopen de NSS copiados: $dlopened"
  fi

  step "Fuentes del sistema"
  if [ -f "$FONTCONF" ] && compgen -G "$FONTDIR/*.ttf" > /dev/null; then
    use_sysroot_env
    note "$(c_ok 'ya están') en $FONTDIR"
  elif system_fonts_usable; then
    # El host ya mide texto sin nuestra caché: no descargar nada (no-op en
    # máquinas normales, sin depender de apt ni de red). Se dejan sin exportar
    # los overrides de fontconfig para que las suites usen las fuentes del sistema.
    unset FONTCONFIG_FILE FONTCONFIG_PATH
    note "$(c_ok 'del sistema') (el texto se mide sin descargar fuentes)"
  else
    if command -v apt-get > /dev/null && command -v dpkg > /dev/null; then
      note "descargando fonts-liberation"
      mkdir -p "$CACHE/apt/lists" "$CACHE/apt/archives" "$FONTDIR"
      if [ ! -f "$CACHE/apt/.updated" ]; then
        apt_get update > "$CACHE/apt/update.log" 2>&1 ||
          { fail "apt-get update falló, ver $CACHE/apt/update.log"; return 1; }
        touch "$CACHE/apt/.updated"
      fi
      ( cd "$CACHE/apt/archives" && apt_get download fonts-liberation >> "$CACHE/apt/download.log" 2>&1 ) ||
        { fail "no se pudo descargar fonts-liberation"; return 1; }
      mkdir -p "$SYSROOT/root"
      extract_debs "$CACHE/apt/archives"/fonts-liberation*.deb || { fail "dpkg -x falló"; return 1; }
      find "$SYSROOT/root" -name '*.ttf' -exec cp -Lf {} "$FONTDIR/" \;
      write_fonts_conf
      use_sysroot_env
      note "$(c_ok 'preparadas') $(ls "$FONTDIR" | wc -l | tr -d ' ') fuentes en $FONTDIR"
    else
      fail "No hay fuentes y no hay apt-get/dpkg para traerlas"
      note "  con root: apt-get install -y fonts-liberation"
      return 1
    fi
  fi
  return 0
}

# --------------------------------------------------------------------- vite ---

vite_running() { curl -fsS -o /dev/null "$URL" 2>/dev/null; }

# PGID del dev server. `setsid` hace fork cuando el proceso que lo llama ya es
# líder de grupo, así que el PID que devuelve `$!` no sirve para matarlo: hay que
# quedarse con el grupo real del proceso node.
#
# El anclaje es el binario (`node_modules/.bin/vite`) y no "vite --config ...":
# el propio awk lleva la ruta del config en su línea de comandos, así que un
# patrón laxo se encontraba a sí mismo y devolvía el PGID del script (matando la
# shell que lo invoca al hacer `kill -- -PGID`).
vite_pgid() {
  # El anclaje va por entorno, no por argv: si viaja en la línea de comandos,
  # el propio awk se encuentra a sí mismo en `ps`.
  VITE_BIN="$ROOT/node_modules/.bin/vite" \
    ps -eo pgid=,args= --no-headers 2>/dev/null |
    VITE_BIN="$ROOT/node_modules/.bin/vite" awk 'index($0, ENVIRON["VITE_BIN"]) { print $1; exit }'
}

# PID del proceso node de vite (los envoltorios de npx salen solos cuando su hijo
# termina, así que basta con señalizar a este).
vite_pid() {
  VITE_BIN="$ROOT/node_modules/.bin/vite" \
    ps -eo pid=,args= --no-headers 2>/dev/null |
    VITE_BIN="$ROOT/node_modules/.bin/vite" awk 'index($0, ENVIRON["VITE_BIN"]) { print $1; exit }'
}

# PGID propio: nunca hay que matar el grupo del script ni el de su shell.
own_pgid() { ps -o pgid= -p "$$" 2>/dev/null | tr -d ' '; }

start_vite() {
  vite_running && return 1
  step "Dev server del renderer (: $PORT)"
  # El root de vite es relativo a cwd (ver tests/vite.e2e.config.ts), no al config.
  # `disown` evita que la shell informe del SIGTERM del proceso al detenerlo.
  ( cd "$ROOT" && setsid nohup npx vite --config tests/vite.e2e.config.ts --port "$PORT" \
      > "$VITE_LOG" 2>&1 < /dev/null & disown )
  local i pgid pid
  for i in $(seq 1 40); do
    sleep 1
    if vite_running; then
      pgid="$(vite_pgid)"
      pid="$(vite_pid)"
      if [ -n "$pgid" ] && [ "$pgid" != "$(own_pgid)" ]; then
        echo "$pgid" > "$CACHE/vite.pgid"
      else
        pgid=''
      fi
      [ -n "$pid" ] && echo "$pid" > "$CACHE/vite.pid"
      note "$(c_ok 'arrancado') (pid ${pid:-?}, pgid ${pgid:-?})"
      return 0
    fi
  done
  fail "el dev server no respondió en 40s, ver $VITE_LOG"
  stop_vite
  return 2
}

# Detiene el dev server que arrancó este script (nunca uno ajeno) y comprueba que
# deja de responder: dejarlo huérfano hace fallar la siguiente ejecución.
#
# Se empieza por SIGTERM al proceso node y no al grupo: así vite se apaga por su
# cuenta y la shell no imprime "Terminated" al cosechar un hijo muerto por señal.
# Si no basta, se escala al grupo y finalmente a SIGKILL.
stop_vite() {
  local pid pgid waited=0
  pid="$(cat "$CACHE/vite.pid" 2>/dev/null)"
  pgid="$(cat "$CACHE/vite.pgid" 2>/dev/null)"

  if [ -n "$pid" ]; then
    kill -TERM "$pid" 2>/dev/null
    while [ "$waited" -lt 10 ] && vite_running; do
      sleep 1
      waited=$((waited + 1))
    done
  fi
  if vite_running && [ -n "$pgid" ] && [ "$pgid" != "$(own_pgid)" ]; then
    kill -TERM -- "-$pgid" 2>/dev/null
    sleep 2
  fi
  if vite_running && [ -n "$pgid" ] && [ "$pgid" != "$(own_pgid)" ]; then
    kill -KILL -- "-$pgid" 2>/dev/null
    sleep 1
  fi
  # Último recurso por binario: sólo se llega aquí si el dev server lo arrancó
  # este script (el puerto es strictPort, no puede ser el de otra persona).
  if vite_running; then
    for pid in $(VITE_BIN="$ROOT/node_modules/.bin/vite" ps -eo pid=,args= --no-headers 2>/dev/null |
      VITE_BIN="$ROOT/node_modules/.bin/vite" awk 'index($0, ENVIRON["VITE_BIN"]) { print $1 }'); do
      [ "$pid" = "$$" ] && continue
      kill -TERM "$pid" 2>/dev/null
    done
    sleep 2
  fi
  rm -f "$CACHE/vite.pgid" "$CACHE/vite.pid"
  if vite_running; then
    fail "el dev server sigue en el puerto $PORT: revísalo a mano"
    return 1
  fi
  note "dev server detenido"
}

# Limpieza para las trampas de run_suites: detiene el dev server sólo si lo
# arrancó esta invocación (VITE_STARTED_BY_US=yes). Nunca toca un servidor ajeno
# (start_vite devolvió 1 porque el puerto ya respondía).
cleanup_owned_vite() {
  if [ "${VITE_STARTED_BY_US:-no}" = yes ]; then
    stop_vite || true
    VITE_STARTED_BY_US=no
  fi
  return 0
}

# -------------------------------------------------------------------- doctor ---

doctor() {
  local bin rc=0
  # Si la caché ya está preparada, diagnosticar CON ella: es el entorno que
  # usarán las suites al vuelo.
  if [ -d "$LIBDIR" ] && [ -f "$FONTCONF" ]; then
    use_sysroot_env
  fi

  step "Entorno"
  note "node        $(node --version 2>/dev/null || echo 'ausente')"
  note "npm         $(npm --version 2>/dev/null || echo 'ausente')"
  if [ -d "$ROOT/node_modules" ]; then
    note "deps        $(c_ok 'instaladas') (node_modules)"
  else
    note "deps        $(c_bad 'FALTAN')  -> npm ci --ignore-scripts"
    rc=1
  fi

  step "Playwright"
  bin="$(chrome_bin)" || true
  if [ -n "${bin:-}" ]; then
    note "binario     $bin"
  else
    note "binario     $(c_bad 'no resoluble') -> npm i -D playwright | npx playwright --version"
    rc=1
  fi

  step "Bibliotecas de Chromium (arranque)"
  if [ -n "${bin:-}" ] && [ -x "${bin:-}" ]; then
    probe_chromium
    if [ -z "$(missing_libs "$bin")" ]; then
      note "ldd         $(c_ok 'completas')"
    else
      note "ldd         $(c_bad 'faltan') $(missing_libs "$bin" | wc -l | tr -d ' ') libs:"
      missing_libs "$bin" | sed 's/^/      /' | head -10
      rc=1
    fi
    if [ "$PROBE_LAUNCH" -eq 1 ]; then
      note "arranque    $(c_ok 'OK')"
    else
      note "arranque    $(c_bad 'FALLA') -> ver $CACHE/probe.log"
      note "arréglalo con: ./e2e/run.sh env"
      rc=1
    fi
  else
    note "$(c_dim 'omitido: sin binario')"
    rc=1
  fi

  step "Fuentes (la trampa: sin fuentes el texto mide 0)"
  if [ "${PROBE_LAUNCH:-0}" -eq 1 ] && [ "${PROBE_HEIGHT:-0}" -gt 0 ]; then
    note "medición    $(c_ok 'OK') (el texto ocupa ${PROBE_HEIGHT}px)"
    note "fonts.conf  ${FONTCONFIG_FILE:-(el del sistema)}"
  else
    note "medición    $(c_bad 'texto con alto 0') -> los E2E fallarían con"
    note "            'element is not visible' engañoso"
    note "arréglalo con: ./e2e/run.sh env"
    rc=1
  fi

  step "Dev server"
  if vite_running; then
    note "$(c_ok 'activo') en $URL"
  else
    note "$(c_dim 'parado') (lo arranca ./e2e/run.sh al vuelo)"
  fi

  step "Caché"
  note "$CACHE $(c_dim "(sysroot: $([ -d "$LIBDIR" ] && echo sí || echo no), fuentes: $(ls "$FONTDIR" 2>/dev/null | wc -l | tr -d ' '))")"
  if [ -d "$LIBDIR" ]; then
    note "en uso     LD_LIBRARY_PATH=$LIBDIR"
    note "           FONTCONFIG_FILE=$FONTCONF"
  fi

  [ "$rc" -eq 0 ] && printf '\n%s\n' "$(c_ok 'Todo listo para los E2E.')" ||
    printf '\n%s\n' "$(c_bad 'Hay problemas: revisa las líneas marcadas arriba.')"
  return "$rc"
}

# -------------------------------------------------------------------- suites ---

run_suite() {
  local name="$1" log="$CACHE/$1.log" rc=0
  printf '%-24s ' "$name"
  if timeout 600 node "$ROOT/e2e/$name.e2e.cjs" > "$log" 2>&1; then
    echo "$(c_ok PASS)"
    return 0
  else
    rc=$?
    echo "$(c_bad "FAIL (rc=$rc)")"
    tail -8 "$log" | sed 's/^/    /'
    return 1
  fi
}

run_suites() {
  local names=("$@") ordered=() name fail=0
  if [ "${#names[@]}" -eq 0 ]; then
    ordered=("${RUNNERS[@]}")
  else
    for name in "${names[@]}"; do
      case " ${RUNNERS[*]} " in
        *" $name "*) ordered+=("$name") ;;
        *) fail "suite desconocida: $name"; return 2 ;;
      esac
    done
  fi

  prepare_env || return 1
  VITE_STARTED_BY_US=yes
  trap cleanup_owned_vite EXIT
  trap 'cleanup_owned_vite; exit 130' INT
  trap 'cleanup_owned_vite; exit 143' TERM
  start_vite
  local vite_rc=$?
  local started=no
  if [ "$vite_rc" -eq 2 ]; then
    VITE_STARTED_BY_US=no
    trap - EXIT INT TERM
    return 1
  elif [ "$vite_rc" -eq 0 ]; then
    started=yes
  else
    # El puerto ya respondía: el servidor es ajeno, no detenerlo al salir.
    VITE_STARTED_BY_US=no
  fi

  step "Suites E2E (${#ordered[@]})"
  for name in "${ordered[@]}"; do
    run_suite "$name" || fail=1
  done

  local stop_rc=0
  if [ "$started" = yes ]; then
    stop_vite || stop_rc=$?
    VITE_STARTED_BY_US=no
  fi
  trap - EXIT INT TERM
  [ "$stop_rc" -ne 0 ] && fail=1

  if [ "$fail" -eq 0 ]; then
    printf '\n%s\n' "$(c_ok 'Todas las suites han pasado.')"
    return 0
  fi
  printf '\n%s %s\n' "$(c_bad 'Hay suites que han fallado.')" "logs en $CACHE"
  return 1
}

case "${1:-all}" in
  doctor) doctor ;;
  env) prepare_env ;;
  all) run_suites ;;
  -h | --help | help) sed -n '2,33p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
  *) run_suites "$@" ;;
esac
