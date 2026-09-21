import { useTranslation } from '../i18n'
import { usePagesStore } from '../store/pagesStore'
import { pageAncestors } from '../store/pageTree'

export function Breadcrumbs({ pageId }: { pageId: string }) {
  const { t } = useTranslation()
  const pages = usePagesStore((state) => state.pages)
  const selectPage = usePagesStore((state) => state.selectPage)
  const current = pages.find((page) => page.id === pageId)
  const ancestors = pageAncestors(pages, pageId)

  if (!current) return null

  return (
    <nav
      data-breadcrumbs
      aria-label={t('breadcrumbs.ariaLabel')}
      className="mb-4 flex flex-wrap items-center gap-1 text-sm text-faint"
    >
      {ancestors.map((page) => (
        <span key={page.id} className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            data-breadcrumb={page.id}
            onClick={() => selectPage(page.id)}
            className="max-w-48 truncate rounded px-1 py-0.5 transition hover:bg-hover hover:text-ink-soft"
          >
            {page.icon && <span className="mr-1">{page.icon}</span>}
            {page.title || t('common.untitled')}
          </button>
          <span aria-hidden="true">/</span>
        </span>
      ))}
      <span data-breadcrumb-current className="truncate px-1 text-ink-soft">
        {current.icon && <span className="mr-1">{current.icon}</span>}
        {current.title || t('common.untitled')}
      </span>
    </nav>
  )
}
