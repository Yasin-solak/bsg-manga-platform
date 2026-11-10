import { useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowUp, ChartBar, Check, CrownSimple, DotsSixVertical, Info, LockSimple, Medal, PencilSimple, Plus, SquaresFour, Stack, UsersThree, X,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { moveTab, PROFILE_LAYOUT_TABS, type ProfileLayoutTab } from './profileLayout'
import { txa } from '@/i18n/activeLocale'

/*
 * Profile tab bar (tabs v3): sticky under the showcase; a sliding glowing line under the active
 * tab, a content count beside the tab. The owner drags tabs to reorder, hides with an X,
 * brings back with "Add tab". Overview is locked.
 */

const TAB_ICON: Record<ProfileLayoutTab, typeof SquaresFour> = {
  overview: SquaresFour, stats: ChartBar, lists: Stack, about: Info, badges: Medal, favs: CrownSimple, teams: UsersThree,
}

export function ProfileStickyTabs({ tabs, active, onSelect, canEdit, onTabsChange, onTop, avatar, name, stuck, counts }: {
  tabs: ProfileLayoutTab[]
  active: ProfileLayoutTab
  onSelect: (tab: ProfileLayoutTab) => void
  canEdit: boolean
  onTabsChange: (tabs: ProfileLayoutTab[]) => void
  onTop: () => void
  avatar: string
  name: string
  /** The bar stuck to the top (showcase scrolled): avatar + name show only then. */
  stuck: boolean
  /** Sekme yaninda gosterilen icerik sayilari (gonderi, liste, rozet...). */
  counts?: Partial<Record<ProfileLayoutTab, number>>
}) {
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  // Cubuk ekranin altindaysa (vitrin henuz kaymamis) menu yukari acilir.
  const [openUp, setOpenUp] = useState(false)
  const addRef = useRef<HTMLSpanElement>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const addable = (Object.keys(PROFILE_LAYOUT_TABS) as ProfileLayoutTab[]).filter((tab) => !tabs.includes(tab))
  const listRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ left: number, width: number } | null>(null)

  // Aktif sekmenin altindaki cizgi: sekme / sayi / duzen degisince yeniden olculur.
  useLayoutEffect(() => {
    const measure = () => {
      const list = listRef.current
      const node = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      if (!list || !node) { setIndicator(null); return }
      // The tab is in its own (relative) wrapper: position is calculated against the scrollable list.
      const box = node.getBoundingClientRect()
      const left = box.left - list.getBoundingClientRect().left + list.scrollLeft
      setIndicator({ left, width: box.width })
      // If the active tab is outside the scroll area it is made visible (narrow screens).
      if (left < list.scrollLeft || left + box.width > list.scrollLeft + list.clientWidth) {
        list.scrollTo({ left: Math.max(0, left - 24) })
      }
    }
    measure()
    // Tab widths change when the font loads / counts change: each tab is observed.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    listRef.current?.querySelectorAll('[role="tab"]').forEach((node) => observer?.observe(node))
    let alive = true
    void document.fonts?.ready.then(() => { if (alive) measure() })
    return () => { alive = false; observer?.disconnect() }
  }, [active, tabs, editing, counts])

  return (
    <div className='sticky top-14 z-30 -mx-4 border-b border-border bg-background/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-0' data-testid='profile-sticky-tabs'>
      <div className='flex min-h-12 items-center gap-3'>
        <span
          className={cn(
            'flex flex-none items-center gap-2 overflow-hidden transition-all duration-200',
            stuck ? 'max-w-[200px] pr-1 opacity-100' : 'max-w-0 opacity-0',
          )}
          aria-hidden={!stuck}
          data-testid='profile-tabs-identity'
        >
          <img src={avatar} alt='' className='size-7 flex-none rounded-full object-cover' />
          <span className='hidden max-w-[140px] truncate text-[13px] font-bold sm:block'>{name}</span>
        </span>

        <div
          ref={listRef}
          className={cn('relative flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]', editing && 'gap-1.5 rounded-xl border border-dashed border-primary/40 p-1')}
          role='tablist'
          aria-label={txa('Profil sekmeleri')}
        >
          {tabs.map((tab, index) => {
            const Icon = TAB_ICON[tab]
            const on = tab === active && !editing
            const locked = tab === 'overview'
            const count = counts?.[tab]
            return (
              <div
                key={tab}
                draggable={editing && !locked}
                onDragStart={(event) => { if (!editing || locked) { event.preventDefault(); return } event.dataTransfer.effectAllowed = 'move'; setDragFrom(index) }}
                onDragOver={(event) => { if (!editing) return; event.preventDefault(); setDragOver(index) }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragFrom !== null && dragFrom !== index) onTabsChange(moveTab(tabs, dragFrom, Math.max(1, index)))
                  setDragFrom(null)
                  setDragOver(null)
                }}
                onDragEnd={() => { setDragFrom(null); setDragOver(null) }}
                className={cn(
                  'relative flex flex-none items-center rounded-lg transition-opacity',
                  dragFrom === index && 'opacity-35',
                  editing && dragOver === index && dragFrom !== null && dragFrom !== index && 'ring-2 ring-primary/60',
                )}
              >
                <button
                  type='button'
                  role='tab'
                  aria-selected={on}
                  onClick={() => { if (!editing) onSelect(tab) }}
                  className={cn(
                    'group/tab flex items-center gap-2 whitespace-nowrap rounded-lg bg-transparent text-[13.5px] font-semibold transition-colors',
                    editing ? 'h-9 cursor-grab bg-accent pl-2.5 pr-8 text-foreground' : 'h-12 px-3',
                    on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  data-testid='profile-tab'
                >
                  {editing && !locked && <DotsSixVertical weight='bold' size={13} />}
                  <Icon weight={on ? 'fill' : 'regular'} size={16} className={cn('transition-colors', on ? 'text-primary' : 'text-muted-foreground/70 group-hover/tab:text-foreground')} />
                  {PROFILE_LAYOUT_TABS[tab].label}
                  {count !== undefined && count > 0 && !editing && (
                    <span className={cn('rounded-full px-1.5 py-px text-[10.5px] font-bold tabular-nums', on ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
                {editing && !locked && (
                  <button
                    type='button'
                    onClick={() => onTabsChange(tabs.filter((entry) => entry !== tab))}
                    className='absolute right-1.5 flex size-5 items-center justify-center rounded-md bg-transparent text-muted-foreground hover:bg-background hover:text-foreground'
                    title={txa('Sekmeyi kaldır')}
                    aria-label={txa('{v1} sekmesini kaldır', { v1: PROFILE_LAYOUT_TABS[tab].label })}
                  >
                    <X weight='bold' size={11} />
                  </button>
                )}
                {editing && locked && <LockSimple weight='fill' size={11} className='absolute right-2.5 text-muted-foreground' aria-label={txa('Genel Bakış kaldırılamaz')} />}
              </div>
            )
          })}
          {!editing && indicator && (
            <span
              aria-hidden
              className='pointer-events-none absolute bottom-0 h-[3px] rounded-t-full bg-primary shadow-[0_0_14px_hsl(var(--primary)/0.7)] transition-[left,width] duration-300 ease-out'
              style={{ left: indicator.left + 10, width: Math.max(0, indicator.width - 20) }}
              data-testid='profile-tab-indicator'
            />
          )}
        </div>
          {editing && (
          <span ref={addRef} className='relative flex-none'>
            <button type='button' onClick={() => { setOpenUp((addRef.current?.getBoundingClientRect().bottom ?? 0) > window.innerHeight - 300); setAdding((value) => !value) }} className={cn('flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border bg-transparent px-3 text-[12.5px] font-bold', adding ? 'text-primary' : 'text-muted-foreground')}>
              <Plus weight='bold' size={12} />
              {txa('Sekme ekle')}
            </button>
            {adding && (
              <div className={cn('absolute left-0 z-40 w-64 rounded-2xl border border-border bg-popover p-2 shadow-2xl', openUp ? 'bottom-full mb-2' : 'top-full mt-2')} role='menu'>
                <div className='px-2 pb-1.5 pt-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground'>{txa('Eklenebilir sekmeler')}</div>
                {addable.length === 0 && <div className='px-2 py-2 text-[12.5px] text-muted-foreground'>{txa('Tüm sekmeler zaten profilinde.')}</div>}
                {addable.map((tab) => {
                  const Icon = TAB_ICON[tab]
                  return (
                    <button key={tab} type='button' role='menuitem' onClick={() => { onTabsChange([...tabs, tab]); setAdding(false) }} className='flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-accent'>
                      <span className='flex size-8 flex-none items-center justify-center rounded-lg bg-muted'><Icon weight='bold' size={15} /></span>
                      <span className='min-w-0'>
                        <span className='block text-[13px] font-bold'>{PROFILE_LAYOUT_TABS[tab].label}</span>
                        <span className='block text-[11.5px] text-muted-foreground'>{PROFILE_LAYOUT_TABS[tab].description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </span>
        )}

        {editing && <span className='hidden text-[11.5px] text-muted-foreground xl:inline'>{txa('Sürükleyip sırala, çarpıyla gizle')}</span>}
        {canEdit && (
          <button
            type='button'
            onClick={() => { setEditing((value) => !value); setAdding(false) }}
            className={cn(
              'hidden h-9 flex-none items-center gap-1.5 rounded-[10px] px-3 text-[12.5px] font-bold md:flex',
              editing ? 'bg-primary text-primary-foreground' : 'border border-border bg-transparent text-muted-foreground hover:text-foreground',
            )}
            data-testid='profile-tabs-edit'
            title={txa('Sekmeleri düzenle')}
          >
            {editing ? <Check weight='bold' size={13} /> : <PencilSimple weight='bold' size={13} />}
            <span className={editing ? undefined : 'hidden 2xl:inline'}>{editing ? txa('Bitti') : txa('Sekmeleri düzenle')}</span>
          </button>
        )}
        <button type='button' onClick={onTop} title={txa('Vitrine dön')} aria-label={txa('Vitrine dön')} className='hidden h-9 flex-none items-center gap-1.5 rounded-[10px] border border-border bg-transparent px-3 text-[12.5px] font-bold text-muted-foreground hover:text-foreground sm:flex'>
          <ArrowUp weight='bold' size={13} />
          <span className='hidden 2xl:inline'>{txa('Vitrine dön')}</span>
        </button>
      </div>
    </div>
  )
}
