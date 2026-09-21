import { useCallback, useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query]
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot)
}

export const MOBILE_QUERY = '(max-width: 767px)'

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}

/* Puntero primario táctil (móvil/tablet). En híbridos con ratón/trackpad
   `pointer` es `fine`, así que los menús siguen anclados. */
export const TOUCH_QUERY = '(pointer: coarse)'

export function useTouchInput(): boolean {
  return useMediaQuery(TOUCH_QUERY)
}
