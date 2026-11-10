import { setEnDictionary } from '@/i18n/activeLocale'
import { enText } from '@/i18n/messages/enText'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import App from './App'
import AppErrorBoundary from '@/components/common/AppErrorBoundary'
import { renderDocumentHeadTags, resolveDocumentMetaState } from '@/lib/documentMeta'
import { preloadAppRouteModules } from './App'

setEnDictionary(enText)

export { localizePathname } from '@/i18n/localizedRoutes'

type RenderOptions = {
  siteOrigin?: string
}

function renderAppToString(url: string) {
  return new Promise<string>((resolve, reject) => {
    let settled = false
    let renderError: unknown = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const htmlStream = new PassThrough()
    let html = ''

    const finalizeResolve = () => {
      if (settled) {
        return
      }

      settled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      if (renderError) {
        reject(renderError)
        return
      }

      resolve(html)
    }

    const finalizeReject = (error: unknown) => {
      if (settled) {
        return
      }

      settled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      reject(error)
    }

    htmlStream.on('data', (chunk) => {
      html += chunk.toString()
    })

    htmlStream.on('end', finalizeResolve)
    htmlStream.on('error', finalizeReject)

    const { pipe, abort } = renderToPipeableStream(
      <StaticRouter location={url}>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </StaticRouter>,
      {
        // For SEO/prerender output we want the finished HTML of the whole tree, not the Suspense fallback.
        onAllReady() {
          pipe(htmlStream)
        },
        onShellError(error) {
          finalizeReject(error)
        },
        onError(error) {
          renderError = error
        },
      },
    )

    timeoutId = setTimeout(() => {
      abort()
      finalizeReject(new Error(`SSR render zaman asimina ugradi: ${url}`))
    }, 15_000)
  })
}

export async function render(url: string, options: RenderOptions = {}) {
  await preloadAppRouteModules()

  const requestUrl = new URL(url, options.siteOrigin ?? 'https://bsgmanga.pages.dev')
  const routeLocation = `${requestUrl.pathname}${requestUrl.search}`
  const meta = resolveDocumentMetaState({
    pathname: requestUrl.pathname,
    search: requestUrl.search,
    siteOrigin: options.siteOrigin,
  })

  const appHtml = await renderAppToString(routeLocation)

  return {
    appHtml,
    documentHead: renderDocumentHeadTags(meta),
    meta,
  }
}
