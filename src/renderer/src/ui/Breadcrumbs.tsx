import { useTranslation } from '../i18n'
import { usePagesStore } from '../store/pagesStore'
import { pageAncestors } from '../store/pageTree'
import { Icon } from './Icon'

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
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-faint"
    >
      {ancestors.map((page) => (
        <span key={page.id} className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            data-breadcrumb={page.id}
            onClick={() => selectPage(page.id)}
            className="max-w-48 truncate rounded-[5px] px-[7px] py-[3px] font-medium transition hover:bg-hover hover:text-ink"
          >
            {page.icon && <span className="mr-1">{page.icon}</span>}
            {page.title || t('common.untitled')}
          </button>
          <Icon name="chev-right" size={13} className="shrink-0 text-muted" />
        </span>
      ))}
      <span data-breadcrumb-current className="truncate px-[7px] py-[3px] font-medium text-ink-soft">
        {current.icon && <span className="mr-1">{current.icon}</span>}
        {current.title || t('common.untitled')}
      </span>
    </nav>
  )
}
