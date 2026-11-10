import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { isStaleChunkError, reloadForStaleChunk } from './staleChunkReload'

type RouteModule<T extends ComponentType<any>> = { default: T }

export type PreloadableRoute<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  preload: () => Promise<RouteModule<T>>
}

export function lazyRoute<T extends ComponentType<any>>(loader: () => Promise<RouteModule<T>>): PreloadableRoute<T> {
  // If an old deploy's chunk is gone, reload the page once; do not draw the error screen during the reload.
  const resilientLoader = () => loader().catch((error: unknown) => {
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
