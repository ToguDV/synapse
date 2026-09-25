export const en = {
  common: {
    untitled: 'Untitled',
    untitledPage: 'Untitled',
    cancel: 'Cancel',
    delete: 'Delete',
    loading: 'Loading…',
    noResults: 'No results'
  },
  sidebar: {
    collapse: 'Collapse',
    expand: 'Expand',
    addSubpage: 'Add subpage',
    pageOptions: 'Page options',
    pagesLabel: 'Pages',
    newPage: 'New page',
    search: 'Search',
    searchTooltip: 'Search (Ctrl+K)',
    openSidebar: 'Open sidebar',
    closeSidebar: 'Close sidebar',
    deleteConfirmTitle: 'Delete “{{title}}”?',
    deleteWithChildren: {
      one: 'This will also delete {{count}} subpage and all of its content. This action cannot be undone.',
      other:
        'This will also delete {{count}} subpages and all of their content. This action cannot be undone.'
    },
    deleteWithoutChildren:
      'The page and all of its content will be deleted. This action cannot be undone.'
  },
  theme: {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    ariaLabel: 'Theme',
    current: 'Theme: {{theme}}',
    tooltip: 'Theme: {{theme}}. Click to change'
  },
  language: {
    ariaLabel: 'Language',
    english: 'English',
    spanish: 'Spanish'
  },
  pageMenu: {
    rename: 'Rename',
    addSubpage: 'Add subpage',
    changeIcon: 'Change icon',
    delete: 'Delete'
  },
  blockMenu: {
    convert: 'Turn into…',
    duplicate: 'Duplicate',
    moveUp: 'Move up',
    moveDown: 'Move down',
    delete: 'Delete'
  },
  slashMenu: {
    ariaLabel: 'Basic blocks'
  },
  search: {
    ariaLabel: 'Search',
    placeholder: 'Search pages and blocks…',
    empty: 'No results for “{{term}}”',
    searching: 'Searching…',
    pagesGroup: 'Pages',
    blocksGroup: 'Blocks',
    pageKind: 'Page',
    blockKind: 'Block',
    help: '↑↓ to move · Enter to open · Esc to close'
  },
  app: {
    changeIcon: 'Change icon',
    addIcon: 'Add icon'
  },
  iconPicker: {
    remove: 'Remove icon'
  },
  breadcrumbs: {
    ariaLabel: 'Page path'
  },
  blocks: {
    loading: 'Loading blocks…',
    loadError: 'Could not load this page.',
    retry: 'Retry',
    handle: {
      label: 'Block options'
    },
    paragraph: {
      label: 'Text',
      description: 'Plain paragraph',
      placeholder: "Write something… ('/' for commands)",
      keywords: ['text', 'paragraph', 'plain', 'normal']
    },
    heading: {
      label: 'Heading',
      description: 'Large section heading',
      placeholder: 'Heading',
      keywords: ['heading', 'title', 'h1', 'h2', 'h3']
    },
    bullet: {
      label: 'Bulleted list',
      description: 'List item',
      placeholder: 'List item',
      keywords: ['bullet', 'bulleted list', 'list', 'item', 'point']
    },
    todo: {
      label: 'To-do',
      description: 'Checkbox item',
      placeholder: 'To-do',
      keywords: ['todo', 'to-do', 'task', 'checkbox', 'check'],
      statusLabel: 'Status',
      status: {
        backlog: 'Backlog',
        todo: 'To do',
        inProgress: 'In progress',
        done: 'Done',
        cancelled: 'Cancelled'
      }
    },
    code: {
      label: 'Code',
      description: 'Monospace block',
      placeholder: 'Code',
      keywords: ['code', 'monospace', 'snippet']
    },
    quote: {
      label: 'Quote',
      description: 'Highlighted quote',
      placeholder: 'Quote',
      keywords: ['quote', 'blockquote', 'citation']
    },
    divider: {
      label: 'Divider',
      description: 'Separator line',
      placeholder: '',
      keywords: ['divider', 'separator', 'line', 'rule']
    }
  }
}
