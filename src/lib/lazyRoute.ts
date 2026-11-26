import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { ensureEnDictionaryPart, type EnDictionaryPart } from '@/i18n/activeLocale'
import { isStaleChunkError, reloadForStaleChunk } from './staleChunkReload'

type RouteModule<T extends ComponentType<any>> = { default: T }

export type PreloadableRoute<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  preload: () => Promise<RouteModule<T>>
}

type LazyRouteOptions = {
  /** Panel whose English texts live in their own dictionary part (see i18n/activeLocale). */
  enPart?: EnDictionaryPart
}

export function lazyRoute<T extends ComponentType<any>>(
  loader: () => Promise<RouteModule<T>>,
  options: LazyRouteOptions = {},
): PreloadableRoute<T> {
  const { enPart } = options
  // The part lands BEFORE the page module is imported, so text the module evaluates while it
  // loads is already English. A failed part must not block the panel: it opens with Turkish
  // text for those strings. A stale chunk goes on to the reload below.
  const load = enPart
    ? () => ensureEnDictionaryPart(enPart)
        .catch((error: unknown) => {
          if (isStaleChunkError(error)) throw error
        })
        .then(loader)
    : loader
  // If an old deploy's chunk is gone, reload the page once; do not draw the error screen during the reload.
  const resilientLoader = () => load().catch((error: unknown) => {
    if (isStaleChunkError(error) && reloadForStaleChunk()) {
      return new Promise<RouteModule<T>>(() => {})
    }
    throw error
  })
  const RouteComponent = lazy(resilientLoader) as PreloadableRoute<T>
  RouteComponent.preload = resilientLoader
  return RouteComponent
}

export async function preloadLazyRoutes(routes: ReadonlyArray<{ preload: () => Promise<unknown> }>) {
  await Promise.all(routes.map((route) => route.preload()))
}
