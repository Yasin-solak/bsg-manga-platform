import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reportRenderCrash } from '@/components/common/reportRenderCrash'
import { isStaleChunkError, reloadForStaleChunk } from '@/lib/staleChunkReload'
import { txa } from '@/i18n/activeLocale'

type BoundaryProps = {
  children: ReactNode
  resetKey?: string
  /** Silent boundaries render nothing on error (global chrome widgets). */
  silent?: boolean
  boundary: string
}

type BoundaryState = {
  error: Error | null
  resetKey: string | undefined
  reloading: boolean
}

class ScopedErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, resetKey: this.props.resetKey, reloading: false }

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    // The route changed: clear the boundary so the new page gets a fresh chance to render.
    return { error: null, reloading: false, resetKey: props.resetKey }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Old tab after a deploy: same recovery as lazyRoute, one silent reload instead of an error panel.
    if (!this.props.silent && isStaleChunkError(error) && reloadForStaleChunk()) {
      this.setState({ reloading: true })
      return
    }
    reportRenderCrash(error, errorInfo, { resetKey: this.props.resetKey, boundary: this.props.boundary })
  }

  private handleRetry = () => {
    this.setState({ error: null, reloading: false })
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    const { error, reloading } = this.state
    if (!error) return this.props.children
    if (this.props.silent || reloading) return null

    const staleBuild = isStaleChunkError(error)

    return (
      <div className='flex min-h-[50vh] w-full items-center justify-center px-4 py-10' role='alert' data-testid='route-error-fallback'>
        <div className='flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card/95 p-6 text-center'>
          <div className='flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive'>
            <AlertTriangle className='size-5' />
          </div>
          <div className='space-y-1'>
            <h2 className='text-lg font-semibold tracking-tight text-foreground'>
              {staleBuild ? txa('Site güncellendi.') : txa('Bu sayfa şu anda açılamadı.')}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {staleBuild
                ? txa('Bu sekme sitenin eski sürümünü çalıştırıyor. Sayfayı yenilediğinde yeni sürüm yüklenir.')
                : txa('Sayfanın bu bölümünde bir sorun oluştu. Menü çalışmaya devam ediyor; yeniden deneyebilir veya başka bir sayfaya geçebilirsin.')}
            </p>
          </div>
          {staleBuild ? (
            <Button type='button' onClick={this.handleReload}>
              <RotateCcw className='size-4' />
              {txa('Sayfayı yenile')}
            </Button>
          ) : (
            <Button type='button' onClick={this.handleRetry}>
              <RotateCcw className='size-4' />
              {txa('Tekrar dene')}
            </Button>
          )}
        </div>
      </div>
    )
  }
}

/** Route-level boundary: resets automatically whenever the pathname changes. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ScopedErrorBoundary boundary='route' resetKey={pathname}>{children}</ScopedErrorBoundary>
}

/** Silent boundary for global chrome widgets: a bad record must not break navigation. */
export function SilentErrorBoundary({ children, name }: { children: ReactNode, name: string }) {
  return <ScopedErrorBoundary boundary={name} silent>{children}</ScopedErrorBoundary>
}
