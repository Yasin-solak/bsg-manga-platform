import type { ReactNode } from 'react'
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail, SidebarTrigger } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface AdminPageShellProps {
  sidebar: ReactNode
  /** Context shown in the mobile top bar (active section name). */
  mobileTitle?: string
  /**
   * Desk pages (list + details): at xl and up the content is fixed to screen height;
   * the page does not scroll, title and tabs stay in place, list and details scroll
   * inside. `xl:min-h-0 xl:flex-1` on the section root is enough.
   */
  fill?: boolean
  children: ReactNode
}

/**
 * AdminPageShell: a work area for the admin panel independent of site chrome.
 *
 * A sidebar collapsing to icon mode on desktop (Ctrl/Cmd+B), a drawer opened by a button in the
 * top bar on mobile. Same language as the fansub studio shell.
 */
export function AdminPageShell({ sidebar, mobileTitle, fill = false, children }: AdminPageShellProps) {
  return (
    <SidebarProvider className="min-h-screen bg-background">
      <Sidebar collapsible="icon" className="z-20 border-r border-border/70 bg-card/80 backdrop-blur-sm">
        {sidebar}
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="bg-background">
        <div className={cn('min-h-screen', fill && 'xl:flex xl:h-svh xl:min-h-0 xl:flex-col')} data-admin-fill={fill ? 'true' : undefined}>
          <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur lg:hidden">
            <SidebarTrigger aria-label={txa('Yönetim menüsünü aç')} />
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">{mobileTitle || txa('Yönetim paneli')}</span>
          </div>
          <div className={cn('px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7', fill && 'xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:pb-6')}>
            <div className={cn('mx-auto max-w-screen-2xl', fill && 'xl:flex xl:min-h-0 xl:w-full xl:flex-1 xl:flex-col')}>
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
