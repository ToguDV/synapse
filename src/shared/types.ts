export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bullet',
  'todo',
  'code',
  'quote',
  'divider'
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export interface Page {
  id: string
  title: string
  parentId: string | null
  icon: string | null
  position: number
  createdAt: number
  updatedAt: number
}

export interface Block {
  id: string
  pageId: string
  type: BlockType
  content: string
  position: number
  indent: number
  createdAt: number
  updatedAt: number
}

export interface PageCreateInput {
  title?: string
  parentId?: string | null
}

export interface PageMoveInput {
  parentId: string | null
  position: number
}

export interface BlockCreateInput {
  id?: string
  pageId: string
  type?: BlockType
  content?: string
  position?: number
  indent?: number
}

export interface BlockUpdatePatch {
  type?: BlockType
  content?: string
  indent?: number
}

export interface SearchPageResult {
  kind: 'page'
  pageId: string
  title: string
  icon: string | null
  updatedAt: number
}

export interface SearchBlockResult {
  kind: 'block'
  blockId: string
  pageId: string
  pageTitle: string
  pageIcon: string | null
  blockType: BlockType
  text: string
  updatedAt: number
}

export type SearchResult = SearchPageResult | SearchBlockResult

export interface Api {
  versions: {
    electron: string
    node: string
  }
  pages: {
    list: () => Promise<Page[]>
    get: (id: string) => Promise<Page | null>
    create: (input?: PageCreateInput) => Promise<Page>
    rename: (id: string, title: string) => Promise<Page>
    setIcon: (id: string, icon: string | null) => Promise<Page>
    move: (id: string, input: PageMoveInput) => Promise<Page>
    remove: (id: string) => Promise<void>
  }
  blocks: {
    list: (pageId: string) => Promise<Block[]>
    create: (input: BlockCreateInput) => Promise<Block>
    update: (id: string, patch: BlockUpdatePatch) => Promise<Block>
    reorder: (pageId: string, orderedIds: string[]) => Promise<Block[]>
    remove: (id: string) => Promise<void>
  }
  search: {
    query: (term: string, limit?: number) => Promise<SearchResult[]>
  }
  settings: {
    get: (key: string) => Promise<string | null>
    set: (key: string, value: string) => Promise<void>
  }
}
