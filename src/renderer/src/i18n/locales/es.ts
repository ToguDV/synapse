import type { Messages } from './index'

export const es: Messages = {
  common: {
    untitled: 'Sin título',
    untitledPage: 'Sin título',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    loading: 'Cargando…',
    noResults: 'Sin resultados'
  },
  sidebar: {
    collapse: 'Contraer',
    expand: 'Expandir',
    addSubpage: 'Añadir subpágina',
    pageOptions: 'Opciones de página',
    pagesLabel: 'Páginas',
    newPage: 'Nueva página',
    search: 'Buscar',
    searchTooltip: 'Buscar (Ctrl+K)',
    openSidebar: 'Abrir barra lateral',
    closeSidebar: 'Cerrar barra lateral',
    deleteConfirmTitle: '¿Eliminar “{{title}}”?',
    deleteWithChildren: {
      one: 'Esto también eliminará {{count}} subpágina y todo su contenido. Esta acción no se puede deshacer.',
      other:
        'Esto también eliminará {{count}} subpáginas y todo su contenido. Esta acción no se puede deshacer.'
    },
    deleteWithoutChildren:
      'La página y todo su contenido se eliminarán. Esta acción no se puede deshacer.'
  },
  theme: {
    light: 'Claro',
    dark: 'Oscuro',
    system: 'Sistema',
    ariaLabel: 'Tema',
    current: 'Tema: {{theme}}',
    tooltip: 'Tema: {{theme}}. Clic para cambiar'
  },
  language: {
    ariaLabel: 'Idioma',
    english: 'Inglés',
    spanish: 'Español'
  },
  pageMenu: {
    rename: 'Renombrar',
    addSubpage: 'Añadir subpágina',
    changeIcon: 'Cambiar icono',
    delete: 'Eliminar'
  },
  blockMenu: {
    convert: 'Convertir en…',
    duplicate: 'Duplicar',
    moveUp: 'Subir',
    moveDown: 'Bajar',
    delete: 'Eliminar'
  },
  slashMenu: {
    ariaLabel: 'Bloques básicos'
  },
  search: {
    ariaLabel: 'Buscar',
    placeholder: 'Buscar páginas y bloques…',
    empty: 'Sin resultados para “{{term}}”',
    searching: 'Buscando…',
    pagesGroup: 'Páginas',
    blocksGroup: 'Bloques',
    pageKind: 'Página',
    blockKind: 'Bloque',
    help: '↑↓ para moverte · Enter para abrir · Esc para cerrar'
  },
  app: {
    changeIcon: 'Cambiar icono',
    addIcon: 'Añadir icono'
  },
  iconPicker: {
    remove: 'Quitar icono'
  },
  breadcrumbs: {
    ariaLabel: 'Ruta de la página'
  },
  blocks: {
    loading: 'Cargando bloques…',
    loadError: 'No se pudo cargar esta página.',
    retry: 'Reintentar',
    handle: {
      label: 'Opciones del bloque'
    },
    paragraph: {
      label: 'Texto',
      description: 'Párrafo normal',
      placeholder: "Escribe algo… ('/' para comandos)",
      keywords: ['texto', 'párrafo', 'parrafo', 'normal']
    },
    heading: {
      label: 'Título',
      description: 'Encabezado de sección grande',
      placeholder: 'Título',
      keywords: ['título', 'titulo', 'encabezado', 'h1']
    },
    bullet: {
      label: 'Lista con viñetas',
      description: 'Elemento de lista',
      placeholder: 'Elemento de lista',
      keywords: ['viñeta', 'lista', 'punto', 'elemento']
    },
    todo: {
      label: 'Tarea',
      description: 'Elemento con casilla',
      placeholder: 'Tarea',
      keywords: ['tarea', 'pendiente', 'casilla', 'lista'],
      statusLabel: 'Estado',
      status: {
        backlog: 'En cola',
        todo: 'Por hacer',
        inProgress: 'En curso',
        done: 'Hecha',
        cancelled: 'Cancelada'
      }
    },
    code: {
      label: 'Código',
      description: 'Bloque monoespaciado',
      placeholder: 'Código',
      keywords: ['código', 'codigo', 'monoespaciado', 'fragmento']
    },
    quote: {
      label: 'Cita',
      description: 'Cita destacada',
      placeholder: 'Cita',
      keywords: ['cita', 'destacada', 'bloque']
    },
    divider: {
      label: 'Separador',
      description: 'Línea separadora',
      placeholder: '',
      keywords: ['separador', 'línea', 'linea', 'regla', 'divisor']
    }
  }
}
