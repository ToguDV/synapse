import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { ThemePreference } from '../../../shared/theme'
import type { RectAnchor } from '../editor/types'
import { useTranslation, type MessageKey } from '../i18n'
import { usePagesStore } from '../store/pagesStore'
import { useThemeStore } from '../store/themeStore'
import { buildPageTree, collectDescendantIds, type PageNode } from '../store/pageTree'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon, type IconName } from './Icon'
import { IconPicker } from './IconPicker'
import { Kbd } from './Kbd'
import { PageMenu } from './PageMenu'
import { rectAnchor, rectAnchorIfConnected } from './rectAnchor'

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark']

type PageDropZone = 'before' | 'after' | 'inside'

interface PendingPageDrag {
  pageId: string
  x: number
  y: number
}

interface PageDragState {
  pageId: string
  overId: string | null
  zone: PageDropZone
}

interface PageDropTarget {
  id: string
  zone: PageDropZone
}

const DRAG_THRESHOLD_PX = 4
const AUTO_EXPAND_MS = 500

const byPagePosition = (a: { position: number; createdAt: number; id: string }, b: typeof a): number =>
  a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id)

const THEME_META: Record<ThemePreference, { icon: IconName; labelKey: MessageKey }> = {
  system: { icon: 'monitor', labelKey: 'theme.system' },
  light: { icon: 'sun', labelKey: 'theme.light' },
  dark: { icon: 'moon', labelKey: 'theme.dark' }
}

function ThemeSegmented() {
  const { t } = useTranslation()
  const preference = useThemeStore((state) => state.preference)
  const setPreference = useThemeStore((state) => state.setPreference)

  return (
    <div
      data-theme-toggle
      data-theme-preference={preference}
      role="group"
      aria-label={t('theme.ariaLabel')}
      className="inline-flex gap-0.5 rounded-[9px] border border-border bg-hover p-0.5"
    >
      {THEME_OPTIONS.map((option) => {
        const meta = THEME_META[option]
        return (
          <button
            key={option}
            type="button"
            data-theme-option={option}
            aria-pressed={option === preference}
            title={t(meta.labelKey)}
            onClick={() => setPreference(option)}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-muted transition hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-[0_1px_3px_rgb(0_0_0/0.18)]"
          >
            <Icon name={meta.icon} size={15} />
          </button>
        )
      })}
    </div>
  )
}

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
      className="mx-1 min-w-0 flex-1 rounded-md border border-accent bg-surface px-1.5 py-0.5 text-sm text-ink ring-[3px] ring-ring outline-none"
    />
  )
}

interface PageTreeItemProps {
  node: PageNode
  depth: number
  renamingId: string | null
  draggingId: string | null
  drop: PageDropTarget | null
  suppressClickRef: MutableRefObject<boolean>
  onStartRename: (id: string) => void
  onRenameCommit: (id: string, title: string) => void
  onRenameCancel: () => void
  onOpenMenu: (pageId: string, source: HTMLButtonElement) => void
  onDragPointerDown: (pageId: string, event: ReactPointerEvent<HTMLButtonElement>) => void
}

function PageTreeItem({
  node,
  depth,
  renamingId,
  draggingId,
  drop,
  suppressClickRef,
  onStartRename,
  onRenameCommit,
  onRenameCancel,
  onOpenMenu,
  onDragPointerDown
}: PageTreeItemProps) {
  const { t } = useTranslation()
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
  const isDragging = draggingId === page.id
  const dropZone = drop?.id === page.id ? drop.zone : null

  const openMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    onOpenMenu(page.id, event.currentTarget)
  }

  return (
    <div>
      <div
        data-page-id={page.id}
        data-page-depth={depth}
        data-page-drop={dropZone ?? undefined}
        data-page-dragging={isDragging ? 'true' : undefined}
        data-active={isActive}
        style={{ marginLeft: depth * 16 }}
        className={`group relative flex h-[30px] items-center gap-1.5 rounded-md px-2 transition ${
          dropZone === 'inside'
            ? 'bg-selected text-ink ring-1 ring-inset ring-sapphire'
            : isActive
              ? 'bg-selected text-ink'
              : 'text-muted hover:bg-hover hover:text-ink'
        } ${isDragging ? 'opacity-40' : ''}`}
      >
        {dropZone === 'before' && (
          <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded-full bg-sapphire" />
        )}
        {dropZone === 'after' && (
          <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-sapphire" />
        )}
        {hasChildren ? (
          <button
            type="button"
            data-page-toggle
            data-expanded={expanded}
            aria-label={expanded ? t('sidebar.collapse') : t('sidebar.expand')}
            onClick={() => toggleExpanded(page.id)}
            className="flex h-5 w-4 shrink-0 items-center justify-center rounded text-muted transition hover:bg-hover hover:text-ink"
          >
            <Icon name={expanded ? 'chev-down' : 'chev-right'} size={16} strokeWidth={2.4} />
          </button>
        ) : (
          <span className="h-5 w-4 shrink-0" />
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
            onPointerDown={(event) => onDragPointerDown(page.id, event)}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              selectPage(page.id)
            }}
            onDoubleClick={() => onStartRename(page.id)}
            className="flex h-full min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm font-semibold"
          >
            {page.icon && (
              <span data-page-icon className="shrink-0 text-sm leading-none">
                {page.icon}
              </span>
            )}
            <span className="truncate">{page.title || t('common.untitled')}</span>
          </button>
        )}
        <button
          type="button"
          data-page-action="add-child"
          title={t('sidebar.addSubpage')}
          onClick={() => void createPage(page.id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted opacity-0 transition hover:bg-hover hover:text-ink focus:opacity-100 group-hover:opacity-100"
        >
          <Icon name="plus" size={14} />
        </button>
        <button
          type="button"
          data-page-action="open-menu"
          title={t('sidebar.pageOptions')}
          onClick={openMenu}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted opacity-0 transition hover:bg-hover hover:text-ink focus:opacity-100 group-hover:opacity-100"
        >
          <Icon name="more" size={14} />
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
              draggingId={draggingId}
              drop={drop}
              suppressClickRef={suppressClickRef}
              onStartRename={onStartRename}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onOpenMenu={onOpenMenu}
              onDragPointerDown={onDragPointerDown}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { t } = useTranslation()
  const pages = usePagesStore((state) => state.pages)
  const createPage = usePagesStore((state) => state.createPage)
  const deletePage = usePagesStore((state) => state.deletePage)
  const renamePage = usePagesStore((state) => state.renamePage)
  const setPageIcon = usePagesStore((state) => state.setPageIcon)
  const [menu, setMenu] = useState<
    { pageId: string; source: HTMLButtonElement; anchor: RectAnchor } | null
  >(null)
  const [iconFor, setIconFor] = useState<
    { pageId: string; source: HTMLButtonElement; anchor: RectAnchor } | null
  >(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [drag, setDrag] = useState<PageDragState | null>(null)
  const pendingDragRef = useRef<PendingPageDrag | null>(null)
  const dragRef = useRef<PageDragState | null>(null)
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClickRef = useRef(false)
  const tree = useMemo(() => buildPageTree(pages), [pages])

  useEffect(() => {
    const clearExpandTimer = (): void => {
      if (expandTimerRef.current !== null) {
        clearTimeout(expandTimerRef.current)
        expandTimerRef.current = null
      }
    }

    const endDrag = (): void => {
      clearExpandTimer()
      document.body.classList.remove('select-none', 'cursor-grabbing')
    }

    const onMove = (event: PointerEvent) => {
      const pending = pendingDragRef.current
      if (!pending) return
      if (
        !dragRef.current &&
        Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DRAG_THRESHOLD_PX
      ) {
        return
      }
      if (!dragRef.current) {
        document.body.classList.add('select-none', 'cursor-grabbing')
        suppressClickRef.current = true
      }
      const state = usePagesStore.getState()
      const forbidden = new Set([
        pending.pageId,
        ...collectDescendantIds(state.pages, pending.pageId)
      ])
      const element = document.elementFromPoint(event.clientX, event.clientY)
      const row = element instanceof Element ? element.closest('[data-page-id]') : null
      const overId = row instanceof HTMLElement ? (row.dataset.pageId ?? null) : null
      let next: PageDragState = { pageId: pending.pageId, overId: null, zone: 'before' }
      if (overId && !forbidden.has(overId) && row instanceof HTMLElement) {
        const rect = row.getBoundingClientRect()
        const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1)
        next = {
          pageId: pending.pageId,
          overId,
          zone: ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside'
        }
      }
      dragRef.current = next
      setDrag(next)
      clearExpandTimer()
      if (next.overId && next.zone === 'inside') {
        const targetId = next.overId
        const { pages: current, expandedIds } = usePagesStore.getState()
        const hasChildren = current.some((page) => page.parentId === targetId)
        if (hasChildren && !expandedIds.includes(targetId)) {
          expandTimerRef.current = setTimeout(() => {
            expandTimerRef.current = null
            usePagesStore.getState().toggleExpanded(targetId)
          }, AUTO_EXPAND_MS)
        }
      }
    }

    const onUp = () => {
      const pending = pendingDragRef.current
      pendingDragRef.current = null
      const active = dragRef.current
      dragRef.current = null
      endDrag()
      setDrag(null)
      if (!pending || !active) return
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
      if (!active.overId) return
      const state = usePagesStore.getState()
      const target = state.pages.find((page) => page.id === active.overId)
      if (!target) return
      if (active.zone === 'inside') {
        const count = state.pages.filter(
          (page) => page.parentId === target.id && page.id !== pending.pageId
        ).length
        void state.movePage(pending.pageId, target.id, count)
        return
      }
      const siblings = state.pages
        .filter((page) => page.parentId === target.parentId && page.id !== pending.pageId)
        .sort(byPagePosition)
      const index = siblings.findIndex((page) => page.id === target.id)
      if (index === -1) return
      void state.movePage(
        pending.pageId,
        target.parentId,
        active.zone === 'after' ? index + 1 : index
      )
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!pendingDragRef.current && !dragRef.current) return
      event.preventDefault()
      event.stopPropagation()
      pendingDragRef.current = null
      dragRef.current = null
      endDrag()
      setDrag(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKeyDown, true)
      endDrag()
    }
  }, [])

  const handleDragPointerDown = (pageId: string, event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    pendingDragRef.current = { pageId, x: event.clientX, y: event.clientY }
  }
  const menuPage = menu ? (pages.find((page) => page.id === menu.pageId) ?? null) : null
  const iconPage = iconFor ? (pages.find((page) => page.id === iconFor.pageId) ?? null) : null
  const confirmPage = confirmId ? (pages.find((page) => page.id === confirmId) ?? null) : null
  const descendants = confirmPage ? collectDescendantIds(pages, confirmPage.id).length : 0

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-panel">
      <div className="px-2.5 pt-2.5">
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-hover">
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] text-[10px] font-semibold text-accent">
            SY
          </span>
          <span className="flex-1 truncate text-sm font-semibold text-ink">Synapse</span>
          <Icon name="chev-down" size={15} className="text-muted" />
        </div>
        <button
          type="button"
          data-search-trigger
          onClick={onOpenSearch}
          title={t('sidebar.searchTooltip')}
          className="mt-2 flex h-7 w-full items-center gap-2 rounded-md border border-border bg-surface px-2 text-xs text-faint transition hover:border-border-strong hover:text-muted"
        >
          <Icon name="search" size={14} />
          <span className="flex-1 text-left">{t('sidebar.search')}</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
        <div className="mt-3 mb-1.5 flex items-center justify-between pr-1 pl-2">
          <p className="text-2xs font-semibold tracking-[0.05em] text-faint uppercase">
            {t('sidebar.pagesLabel')}
          </p>
          <button
            type="button"
            data-page-action="new-root"
            onClick={() => void createPage(null)}
            title={t('sidebar.newPage')}
            className="flex h-5 w-5 items-center justify-center rounded text-muted transition hover:bg-hover hover:text-ink"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto">
          {tree.map((node) => (
            <PageTreeItem
              key={node.page.id}
              node={node}
              depth={0}
              renamingId={renamingId}
              draggingId={drag?.pageId ?? null}
              drop={drag?.overId ? { id: drag.overId, zone: drag.zone } : null}
              suppressClickRef={suppressClickRef}
              onStartRename={(id) => setRenamingId(id)}
              onRenameCommit={(id, title) => {
                renamePage(id, title)
                setRenamingId(null)
              }}
              onRenameCancel={() => setRenamingId(null)}
              onOpenMenu={(pageId, source) => {
                setMenu({ pageId, source, anchor: rectAnchor(source) })
                setIconFor(null)
              }}
              onDragPointerDown={handleDragPointerDown}
            />
          ))}
        </nav>
      </div>
      {menu && menuPage && (
        <PageMenu
          pageId={menuPage.id}
          anchor={menu.anchor}
          getAnchor={() => rectAnchorIfConnected(menu.source, menu.anchor)}
          onRename={() => setRenamingId(menuPage.id)}
          onAddChild={() => void createPage(menuPage.id)}
          onIcon={() =>
            setIconFor({ pageId: menuPage.id, source: menu.source, anchor: menu.anchor })
          }
          onDelete={() => setConfirmId(menuPage.id)}
          onClose={() => setMenu(null)}
        />
      )}
      {iconFor && iconPage && (
        <IconPicker
          anchor={iconFor.anchor}
          getAnchor={() => rectAnchorIfConnected(iconFor.source, iconFor.anchor)}
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
          title={t('sidebar.deleteConfirmTitle', {
            title: confirmPage.title || t('common.untitled')
          })}
          message={
            descendants > 0
              ? t('sidebar.deleteWithChildren', { count: descendants })
              : t('sidebar.deleteWithoutChildren')
          }
          onConfirm={() => {
            void deletePage(confirmPage.id)
            setConfirmId(null)
          }}
          onCancel={() => setConfirmId(null)}
        />
      )}
      <div className="flex items-center justify-between gap-2 border-t border-border p-2.5">
        <button
          type="button"
          aria-label={t('sidebar.search')}
          title={t('sidebar.searchTooltip')}
          onClick={onOpenSearch}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-hover hover:text-ink"
        >
          <Icon name="search" size={15} />
        </button>
        <ThemeSegmented />
      </div>
    </aside>
  )
}
