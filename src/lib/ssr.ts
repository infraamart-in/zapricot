import { useEffect, useLayoutEffect } from 'react'

export const isBrowser = typeof window !== 'undefined'

/** useLayoutEffect in the browser, useEffect during prerender (no SSR warning). */
export const useIsoLayoutEffect = isBrowser ? useLayoutEffect : useEffect
