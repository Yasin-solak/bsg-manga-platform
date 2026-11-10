import * as React from 'react'
import { PanelLeft } from 'lucide-react'
import { Slot } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

const SIDEBAR_COOKIE_NAME = 'sidebar_state'
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 30
const SIDEBAR_WIDTH = '18rem'
const SIDEBAR_WIDTH_MOBILE = '18rem'
const SIDEBAR_WIDTH_ICON = '4.5rem'
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'

type SidebarState = 'expanded' | 'collapsed'

interface SidebarContextValue {
  state: SidebarState
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function parseSidebarCookie() {
  if (typeof document === 'undefined') return null
  const cookieEntry = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SIDEBAR_COOKIE_NAME}=`))

  if (!cookieEntry) return null
  const value = cookieEntry.slice(SIDEBAR_COOKIE_NAME.length + 1)
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function useMediaQuery(query: string) {
  const getMatches = React.useCallback(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  }, [query])

  const [matches, setMatches] = React.useState(getMatches)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia(query)
    const onChange = () => setMatches(mediaQuery.matches)
    onChange()
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [query])

  return matches
}

interface SidebarProviderProps extends React.ComponentProps<'div'> {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const [openMobile, setOpenMobile] = React.useState(false)
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(() => {
    const parsedCookie = parseSidebarCookie()
    if (typeof parsedCookie === 'boolean') return parsedCookie
    return defaultOpen
  })

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof openProp === 'boolean') return
    const hasCookie = parseSidebarCookie() !== null
    if (hasCookie) return

    const cookieValue = openProp ?? defaultOpen
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${cookieValue}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
  }, [defaultOpen, openProp])

  React.useEffect(() => {
    if (!isMobile) setOpenMobile(false)
  }, [isMobile])

  const open = openProp ?? uncontrolledOpen
  const state: SidebarState = open ? 'expanded' : 'collapsed'

  const setOpen = React.useCallback((value: boolean) => {
    if (typeof openProp === 'boolean') {
      onOpenChange?.(value)
    } else {
      setUncontrolledOpen(value)
      onOpenChange?.(value)
    }
    if (typeof document !== 'undefined') {
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    }
  }, [onOpenChange, openProp])

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((prev) => !prev)
      return
    }
    setOpen(!open)
  }, [isMobile, open, setOpen])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== SIDEBAR_KEYBOARD_SHORTCUT) return
      event.preventDefault()
      toggleSidebar()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  const contextValue = React.useMemo<SidebarContextValue>(() => ({
    state,
    open,
    setOpen,
    openMobile,
    setOpenMobile,
    isMobile,
    toggleSidebar,
  }), [state, open, setOpen, openMobile, isMobile, toggleSidebar])

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        data-state={state}
        style={{
          '--sidebar-width': SIDEBAR_WIDTH,
          '--sidebar-width-mobile': SIDEBAR_WIDTH_MOBILE,
          '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
          ...style,
        } as React.CSSProperties}
        className={cn('group/sidebar-wrapper flex min-h-screen w-full', className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used inside SidebarProvider.')
  }
  return context
}

interface SidebarProps extends React.ComponentProps<'aside'> {
  side?: 'left' | 'right'
  variant?: 'sidebar' | 'floating' | 'inset'
  collapsible?: 'offcanvas' | 'icon' | 'none'
  dir?: 'ltr' | 'rtl'
}

const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  (
    {
      className,
      side = 'left',
      variant = 'sidebar',
      collapsible = 'icon',
      dir = 'ltr',
      children,
      ...props
    },
    ref,
  ) => {
    const { state, open, isMobile, openMobile, setOpenMobile } = useSidebar()

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetContent
            side={side}
            dir={dir}
            className="w-[var(--sidebar-width-mobile)] border-sidebar-border bg-card p-0 text-card-foreground"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Sidebar</SheetTitle>
              <SheetDescription>{txa('Mobil cihazlarda gösterilen uygulama kenar menüsü.')}</SheetDescription>
            </SheetHeader>
            <div className="flex h-full min-h-0 flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      )
    }

    const effectiveCollapsible = collapsible === 'none' ? 'none' : !open ? collapsible : ''

    return (
      <aside
        ref={ref}
        data-slot="sidebar"
        data-state={state}
        data-side={side}
        data-variant={variant}
        data-collapsible={effectiveCollapsible}
        dir={dir}
        className={cn(
          'group/sidebar relative hidden h-screen shrink-0 bg-card text-card-foreground lg:sticky lg:top-0 lg:flex transition-[width,padding] duration-200',
          side === 'left' ? 'border-r border-sidebar-border' : 'border-l border-sidebar-border',
          variant === 'floating' && 'p-2',
          collapsible === 'none' && 'w-[var(--sidebar-width)]',
          collapsible !== 'none' && open && 'w-[var(--sidebar-width)]',
          collapsible === 'icon' && !open && 'w-[var(--sidebar-width-icon)]',
          collapsible === 'offcanvas' && !open && 'w-0 overflow-hidden border-transparent p-0',
          className,
        )}
        {...props}
      >
        <div className="flex h-full min-h-0 w-full flex-col">{children}</div>
      </aside>
    )
  },
)
Sidebar.displayName = 'Sidebar'

const SidebarInset = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="sidebar-inset"
      className={cn('min-w-0 flex-1 bg-background', className)}
      {...props}
    />
  )
})
SidebarInset.displayName = 'SidebarInset'

const SidebarInput = React.forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(({ className, ...props }, ref) => {
  return <Input ref={ref} data-slot="sidebar-input" className={cn('bg-background', className)} {...props} />
})
SidebarInput.displayName = 'SidebarInput'

const SidebarSeparator = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof Separator>>(({ className, ...props }, ref) => {
  return <Separator ref={ref} data-slot="sidebar-separator" className={cn('bg-sidebar-border', className)} {...props} />
})
SidebarSeparator.displayName = 'SidebarSeparator'

const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof Button>>(
  ({ className, children, ...props }, ref) => {
    const { toggleSidebar } = useSidebar()

    return (
      <Button
        ref={ref}
        type="button"
        variant="outline"
        size="icon-sm"
        className={cn('shrink-0', className)}
        onClick={(event) => {
          props.onClick?.(event)
          if (event.defaultPrevented) return
          toggleSidebar()
        }}
        {...props}
      >
        {children ?? <PanelLeft className="h-4 w-4" />}
        <span className="sr-only">{txa('Kenar menüyü aç/kapat')}</span>
      </Button>
    )
  },
)
SidebarTrigger.displayName = 'SidebarTrigger'

const SidebarRail = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(({ className, ...props }, ref) => {
  const { toggleSidebar, isMobile } = useSidebar()

  if (isMobile) return null

  return (
    <button
      ref={ref}
      data-slot="sidebar-rail"
      aria-label={txa('Sidebar genisligini degistir')}
      className={cn(
        'absolute inset-y-0 z-20 hidden w-4 cursor-col-resize transition-colors after:absolute after:inset-y-0 after:w-px after:bg-sidebar-border/70 hover:after:bg-sidebar-border group-data-[side=left]/sidebar:-right-2 group-data-[side=left]/sidebar:after:left-2 group-data-[side=right]/sidebar:-left-2 group-data-[side=right]/sidebar:after:right-2 group-data-[collapsible=none]/sidebar:hidden lg:block',
        className,
      )}
      onClick={(event) => {
        props.onClick?.(event)
        if (event.defaultPrevented) return
        toggleSidebar()
      }}
      {...props}
    />
  )
})
SidebarRail.displayName = 'SidebarRail'

const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => {
  return <div ref={ref} data-slot="sidebar-header" className={cn('border-b border-sidebar-border p-3', className)} {...props} />
})
SidebarHeader.displayName = 'SidebarHeader'

const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => {
  return <div ref={ref} data-slot="sidebar-content" className={cn('min-h-0 flex-1 overflow-y-auto p-3', className)} {...props} />
})
SidebarContent.displayName = 'SidebarContent'

const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => {
  return <div ref={ref} data-slot="sidebar-footer" className={cn('border-t border-sidebar-border p-3', className)} {...props} />
})
SidebarFooter.displayName = 'SidebarFooter'

const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => {
  return <div ref={ref} data-slot="sidebar-group" className={cn('space-y-2', className)} {...props} />
})
SidebarGroup.displayName = 'SidebarGroup'

const SidebarGroupLabel = React.forwardRef<HTMLParagraphElement, React.ComponentProps<'p'>>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      data-slot="sidebar-group-label"
      className={cn('px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', className)}
      {...props}
    />
  )
})
SidebarGroupLabel.displayName = 'SidebarGroupLabel'

const SidebarGroupAction = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(({ className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      data-slot="sidebar-group-action"
      className={cn('inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', className)}
      type="button"
      {...props}
    />
  )
})
SidebarGroupAction.displayName = 'SidebarGroupAction'

const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => {
  return <div ref={ref} data-slot="sidebar-group-content" className={cn('space-y-1', className)} {...props} />
})
SidebarGroupContent.displayName = 'SidebarGroupContent'

const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(({ className, ...props }, ref) => {
  return <ul ref={ref} data-slot="sidebar-menu" className={cn('space-y-1', className)} {...props} />
})
SidebarMenu.displayName = 'SidebarMenu'

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(({ className, ...props }, ref) => {
  return <li ref={ref} data-slot="sidebar-menu-item" className={cn('relative list-none', className)} {...props} />
})
SidebarMenuItem.displayName = 'SidebarMenuItem'

interface SidebarMenuButtonProps extends React.ComponentProps<'button'> {
  asChild?: boolean
  isActive?: boolean
}

const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className, asChild = false, isActive = false, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button'

    return (
      <Comp
        ref={ref}
        data-slot="sidebar-menu-button"
        data-active={isActive ? 'true' : 'false'}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors outline-none',
          isActive
            ? 'border-primary/50 bg-primary/15 text-foreground'
            : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground',
          className,
        )}
        {...props}
      />
    )
  },
)
SidebarMenuButton.displayName = 'SidebarMenuButton'

const SidebarMenuAction = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  ({ className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        data-slot="sidebar-menu-action"
        type="button"
        className={cn(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground',
          className,
        )}
        {...props}
      />
    )
  },
)
SidebarMenuAction.displayName = 'SidebarMenuAction'

const SidebarMenuBadge = React.forwardRef<HTMLSpanElement, React.ComponentProps<'span'>>(({ className, ...props }, ref) => {
  return (
    <span
      ref={ref}
      data-slot="sidebar-menu-badge"
      className={cn('ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground', className)}
      {...props}
    />
  )
})
SidebarMenuBadge.displayName = 'SidebarMenuBadge'

const SidebarMenuSub = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(({ className, ...props }, ref) => {
  return (
    <ul
      ref={ref}
      data-slot="sidebar-menu-sub"
      className={cn('ml-6 space-y-0.5 border-l border-sidebar-border pl-2', className)}
      {...props}
    />
  )
})
SidebarMenuSub.displayName = 'SidebarMenuSub'

const SidebarMenuSubItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(({ className, ...props }, ref) => {
  return <li ref={ref} data-slot="sidebar-menu-sub-item" className={cn('list-none', className)} {...props} />
})
SidebarMenuSubItem.displayName = 'SidebarMenuSubItem'

interface SidebarMenuSubButtonProps extends React.ComponentProps<'button'> {
  asChild?: boolean
  isActive?: boolean
}

const SidebarMenuSubButton = React.forwardRef<HTMLButtonElement, SidebarMenuSubButtonProps>(
  ({ className, asChild = false, isActive = false, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button'

    return (
      <Comp
        ref={ref}
        data-slot="sidebar-menu-sub-button"
        data-active={isActive ? 'true' : 'false'}
        className={cn(
          'w-full rounded px-2 py-1 text-left text-xs transition-colors',
          isActive
            ? 'bg-primary/20 text-foreground'
            : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
          className,
        )}
        {...props}
      />
    )
  },
)
SidebarMenuSubButton.displayName = 'SidebarMenuSubButton'

interface SidebarMenuSkeletonProps extends React.ComponentProps<'div'> {
  showIcon?: boolean
}

const SidebarMenuSkeleton = React.forwardRef<HTMLDivElement, SidebarMenuSkeletonProps>(
  ({ className, showIcon = false, ...props }, ref) => {
    return (
      <div ref={ref} data-slot="sidebar-menu-skeleton" className={cn('flex items-center gap-2 px-2.5 py-2', className)} {...props}>
        {showIcon ? <Skeleton className="h-4 w-4 rounded" /> : null}
        <Skeleton className="h-4 w-[70%] max-w-[180px]" />
      </div>
    )
  },
)
SidebarMenuSkeleton.displayName = 'SidebarMenuSkeleton'

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
