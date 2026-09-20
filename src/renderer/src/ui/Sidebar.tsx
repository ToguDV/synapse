import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { RectAnchor } from '../editor/types'
import { usePagesStore } from '../store/pagesStore'
import { buildPageTree, collectDescendantIds, type PageNode } from '../store/pageTree'
import { ConfirmDialog } from './ConfirmDialog'
import { IconPicker } from './IconPicker'
import { PageMenu } from './PageMenu'
import { rectAnchor } from './rectAnchor'

function RenameInput({
  initial,
  onCommit,
  onCancel
}: {
  initial: string
  onCommit: (title: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const cancelled = useRef(false)

  return (
    <input
      data-page-rename
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => {
        if (!cancelled.current) onCommit(value)
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelled.current = true
          onCancel()
          event.currentTarget.blur()
        }
      }}
      className="mx-1 min-w-0 flex-1 rounded border border-blue-500 bg-neutral-900 px-1 py-0.5 text-sm text-neutral-100 outline-none"
    />
  )
}

interface PageTreeItemProps {
  node: PageNode
  depth: number
  renamingId: string | null
  onStartRename: (id: string) => void
  onRenameCommit: (id: string, title: string) => void
  onRenameCancel: () => void
  onOpenMenu: (pageId: string, anchor: RectAnchor) => void
}

function PageTreeItem({
  node,
  depth,
  renamingId,
  onStartRename,
  onRenameCommit,
  onRenameCancel,
  onOpenMenu
}: PageTreeItemProps) {
  const { page, children } = node
  const activePageId = usePagesStore((state) => state.activePageId)
  const expandedIds = usePagesStore((state) => state.expandedIds)
  const selectPage = usePagesStore((state) => state.selectPage)
  const toggleExpanded = usePagesStore((state) => state.toggleExpanded)
  const createPage = usePagesStore((state) => state.createPage)
  const hasChildren = children.length > 0
  const expanded = expandedIds.includes(page.id)
  const isActive = page.id === activePageId
  const isRenaming = renamingId === page.id

  const openMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    onOpenMenu(page.id, rectAnchor(event.currentTarget))
  }

  return (
    <div>
      <div
        data-page-id={page.id}
        data-page-depth={depth}
        data-active={isActive}
        style={{ paddingLeft: depth * 12 }}
        className={`group flex items-center gap-0.5 rounded-md pr-1 transition ${
          isActive
            ? 'bg-neutral-800 text-neutral-100'
            : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            data-page-toggle
            data-expanded={expanded}
            aria-label={expanded ? 'Contraer' : 'Expandir'}
            onClick={() => toggleExpanded(page.id)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs text-neutral-500 transition hover:bg-neutral-700 hover:text-neutral-200"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}
        {isRenaming ? (
          <RenameInput
            initial={page.title}
            onCommit={(title) => onRenameCommit(page.id, title)}
            onCancel={onRenameCancel}
          />
        ) : (
          <button
            type="button"
            data-page-title
            onClick={() => selectPage(page.id)}
            onDoubleClick={() => onStartRename(page.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1 text-left text-sm"
          >
            {page.icon && (
              <span data-page-icon className="shrink-0 text-base leading-none">
                {page.icon}
              </span>
            )}
            <span className="truncate">{page.title || 'Sin título'}</span>
          </button>
        )}
        <button
          type="button"
          data-page-action="add-child"
          title="Añadir subpágina"
          onClick={() => void createPage(page.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm text-neutral-500 opacity-0 transition hover:bg-neutral-700 hover:text-neutral-100 focus:opacity-100 group-hover:opacity-100"
        >
          +
        </button>
        <button
          type="button"
          data-page-action="open-menu"
          title="Opciones de página"
          onClick={openMenu}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm text-neutral-500 opacity-0 transition hover:bg-neutral-700 hover:text-neutral-100 focus:opacity-100 group-hover:opacity-100"
        >
          ⋯
        </button>
      </div>
      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <PageTreeItem
              key={child.page.id}
              node={child}
              depth={depth + 1}
              renamingId={renamingId}
              onStartRename={onStartRename}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onOpenMenu={onOpenMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const pages = usePagesStore((state) => state.pages)
  const createPage = usePagesStore((state) => state.createPage)
  const deletePage = usePagesStore((state) => state.deletePage)
  const renamePage = usePagesStore((state) => state.renamePage)
  const setPageIcon = usePagesStore((state) => state.setPageIcon)
  const [menu, setMenu] = useState<{ pageId: string; anchor: RectAnchor } | null>(null)
  const [iconFor, setIconFor] = useState<{ pageId: string; anchor: RectAnchor } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const tree = useMemo(() => buildPageTree(pages), [pages])
  const menuPage = menu ? (pages.find((page) => page.id === menu.pageId) ?? null) : null
  const iconPage = iconFor ? (pages.find((page) => page.id === iconFor.pageId) ?? null) : null
  const confirmPage = confirmId ? (pages.find((page) => page.id === confirmId) ?? null) : null
  const descendants = confirmPage ? collectDescendantIds(pages, confirmPage.id).length : 0

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold tracking-wide text-neutral-300">Synapse</span>
        <button
          type="button"
          data-page-action="new-root"
          onClick={() => void createPage(null)}
          title="Nueva página"
          className="rounded-md px-2 text-lg leading-6 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
        >
          +
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {tree.map((node) => (
          <PageTreeItem
            key={node.page.id}
            node={node}
            depth={0}
            renamingId={renamingId}
            onStartRename={(id) => setRenamingId(id)}
            onRenameCommit={(id, title) => {
              renamePage(id, title)
              setRenamingId(null)
            }}
            onRenameCancel={() => setRenamingId(null)}
            onOpenMenu={(pageId, anchor) => {
              setMenu({ pageId, anchor })
              setIconFor(null)
            }}
          />
        ))}
      </nav>
      {menu && menuPage && (
        <PageMenu
          pageId={menuPage.id}
          anchor={menu.anchor}
          onRename={() => setRenamingId(menuPage.id)}
          onAddChild={() => void createPage(menuPage.id)}
          onIcon={() => setIconFor({ pageId: menuPage.id, anchor: menu.anchor })}
          onDelete={() => setConfirmId(menuPage.id)}
          onClose={() => setMenu(null)}
        />
      )}
      {iconFor && iconPage && (
        <IconPicker
          anchor={iconFor.anchor}
          current={iconPage.icon}
          onSelect={(icon) => {
            setPageIcon(iconPage.id, icon)
            setIconFor(null)
          }}
          onClose={() => setIconFor(null)}
        />
      )}
      {confirmPage && (
        <ConfirmDialog
          title={`¿Eliminar “${confirmPage.title || 'Sin título'}”?`}
          message={
            descendants > 0
              ? `Se eliminarán también ${descendants} ${
                  descendants === 1 ? 'subpágina' : 'subpáginas'
                } y todo su contenido. Esta acción no se puede deshacer.`
              : 'Se eliminará la página y todo su contenido. Esta acción no se puede deshacer.'
          }
          onConfirm={() => {
            void deletePage(confirmPage.id)
            setConfirmId(null)
          }}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </aside>
  )
}
