import type { ReactNode } from 'react'
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail, SidebarTrigger } from '@/components/ui/sidebar'
import { txa } from '@/i18n/activeLocale'

interface FansubStudioShellProps {
  sidebar: ReactNode
  /** Mobil ust cubukta gorunen baglam (fansub adi). */
  mobileTitle?: string
  children: ReactNode
}

/**
 * FansubStudioShell: a work area for fansub management independent of site chrome.
 *
 * A collapsible (icon mode) sidebar on desktop, a drawer opened by a button in the
 * top bar on mobile. Content flows on a calm, single-color background.
 */
export function FansubStudioShell({ sidebar, mobileTitle, children }: FansubStudioShellProps) {
  return (
    <SidebarProvider className="min-h-screen bg-background">
      <Sidebar collapsible="icon" className="z-20 border-r border-border/70 bg-card/80 backdrop-blur-sm">
        {sidebar}
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="bg-background">
        <div className="min-h-screen">
          <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur lg:hidden">
            <SidebarTrigger aria-label={txa('Stüdyo menüsünü aç')} />
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">{mobileTitle || txa('Fansub stüdyosu')}</span>
          </div>

          <div className="px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
            <div className="mx-auto max-w-[1360px]">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
