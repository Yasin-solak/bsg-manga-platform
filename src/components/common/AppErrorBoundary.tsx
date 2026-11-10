import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createScopedLogger } from '@/services/logger'
import { isStaleChunkError } from '@/lib/staleChunkReload'
import { txa } from '@/i18n/activeLocale'

const logger = createScopedLogger('AppErrorBoundary')

type AppErrorBoundaryProps = {
  children: ReactNode
  resetKey: string
}

type AppErrorBoundaryState = {
  error: Error | null
  resetKey: string
}

class AppErrorBoundaryRoot extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(
    props: AppErrorBoundaryProps,
    state: AppErrorBoundaryState,
  ): Partial<AppErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) {
      return null
    }

    // On route change we clear the boundary automatically and do not leave the user on a locked screen.
    return {
      error: null,
      resetKey: props.resetKey,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error({
      event: 'render-crash',
      message: 'Uygulama agaci render sirasinda yakalandi',
      context: {
        resetKey: this.props.resetKey,
        componentStack: errorInfo.componentStack,
      },
      error,
    })
  }

  private handleRetry = () => {
    this.setState((currentState) => ({
      error: null,
      resetKey: currentState.resetKey,
    }))
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    // Old tab after a deploy: chunk not found; the only fix is loading the new version.
    const staleBuild = isStaleChunkError(this.state.error)

    return (
      <div className='flex min-h-screen w-full items-center justify-center bg-background px-4 py-10'>
        <div className='w-full max-w-xl rounded-3xl border border-border/70 bg-card/95 p-8 shadow-lg shadow-black/5'>
          <div className='mb-6 flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive'>
            <AlertTriangle className='size-6' />
          </div>
          <div className='space-y-3'>
            <p className='text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground'>
              {staleBuild ? txa('Yeni sürüm') : txa('Beklenmedik hata')}
            </p>
            <h1 className='text-2xl font-semibold tracking-tight text-foreground'>
              {staleBuild ? txa('Site güncellendi.') : txa('Bu ekran şu anda açılamadı.')}
            </h1>
            <p className='max-w-lg text-sm leading-6 text-muted-foreground'>
              {staleBuild
                ? txa('Bu sekme sitenin eski sürümünü çalıştırıyor. Sayfayı yenilediğinde yeni sürüm yüklenir.')
                : txa('Hata yakalandı ve uygulama tamamen çökmeden durduruldu. Yeniden denemeyi deneyebilir veya ana akışa dönebilirsin.')}
            </p>
          </div>
          <div className='mt-6 flex flex-wrap gap-3'>
            {staleBuild ? (
              <Button type='button' onClick={this.handleReload} data-testid='app-error-stale-reload'>
                <RotateCcw className='size-4' />
                {txa('Sayfayı yenile')}
              </Button>
            ) : (
              <>
                <Button onClick={this.handleRetry}>
                  <RotateCcw className='size-4' />
                  {txa('Tekrar dene')}
                </Button>
                <Button type='button' variant='outline' onClick={this.handleReload}>
                  {txa('Sayfayı yenile')}
                </Button>
              </>
            )}
            <Button asChild type='button' variant='ghost'>
              <a href='/'>
                <Home className='size-4' />
                {txa('Ana sayfaya dön')}
              </a>
            </Button>
          </div>
          <div className='mt-6 rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground'>
            {txa('Teknik detaylar sadece geliştirme günlüğüne yazıldı. Kullanıcıya ham hata metni göstermiyoruz.')}
          </div>
        </div>
      </div>
    )
  }
}

export default function AppErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  const resetKey = `${location.pathname}${location.search}${location.hash}`

  return <AppErrorBoundaryRoot resetKey={resetKey}>{children}</AppErrorBoundaryRoot>
}
