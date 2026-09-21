import type { ReactNode } from 'react'

export type IconName =
  | 'synapse'
  | 'search'
  | 'plus'
  | 'chev-right'
  | 'chev-down'
  | 'moon'
  | 'sun'
  | 'monitor'
  | 'settings'
  | 'more'
  | 'grip'
  | 'check'
  | 'x'
  | 'enter'
  | 'trash'
  | 'copy'
  | 'arrow-up'
  | 'arrow-down'
  | 'swap'
  | 'doc'
  | 'pencil'
  | 'smile'

const PATHS: Record<IconName, ReactNode> = {
  synapse: (
    <>
      <circle cx="5.5" cy="5.5" r="2" />
      <circle cx="18.5" cy="5.5" r="2" />
      <circle cx="12" cy="18.5" r="2" />
      <path d="M7.5 5.5h9M7.1 7.3l3.6 8.9M16.9 7.3l-3.6 8.9" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8L20.5 20.5" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  'chev-right': <path d="M9.5 6l6 6-6 6" />,
  'chev-down': <path d="M6 9.5l6 6 6-6" />,
  moon: <path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7.5h9M18.5 7.5H20M4 16.5h3.5M13 16.5h7" />
      <circle cx="15.8" cy="7.5" r="2" />
      <circle cx="10.3" cy="16.5" r="2" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  grip: (
    <>
      <circle cx="9.5" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  enter: <path d="M18.5 5.5v6a3 3 0 0 1-3 3H6.5M9.5 11.5l-3 3 3 3" />,
  trash: <path d="M4.5 7h15M10 7V4.8h4V7M7.2 7l.9 13.2h7.8L16.8 7" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  'arrow-up': <path d="M12 19.5v-15M6 10.5l6-6 6 6" />,
  'arrow-down': <path d="M12 4.5v15M6 13.5l6 6 6-6" />,
  swap: <path d="M4.5 8.5h15M16 5l3.5 3.5L16 12M19.5 15.5h-15M8 12l-3.5 3.5L8 19" />,
  doc: (
    <>
      <path d="M7 3.5h6.5L18.5 8.5V20.5H7z" />
      <path d="M13.5 3.5v5h5" />
    </>
  ),
  pencil: (
    <>
      <path d="M4.5 19.5l.8-3.6L15.8 5.4a1.9 1.9 0 0 1 2.7 2.7L7.9 18.7z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" />
      <circle cx="9.2" cy="9.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="9.8" r="1" fill="currentColor" stroke="none" />
    </>
  )
}

export function Icon({
  name,
  size = 16,
  className
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
}
