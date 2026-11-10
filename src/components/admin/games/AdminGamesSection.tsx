import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Gamepad2, LayoutDashboard, RefreshCw, Shirt, Trophy, type LucideIcon } from 'lucide-react'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { AdminSectionSkeleton } from '@/components/admin/shared/AdminSectionSkeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getAdminDailyGamesOverview, type DailyGamesOverview } from '@/services/adminDailyGamesService'
import { AdminEventArchive } from './AdminEventArchive'
import { AdminGamesOverview } from './AdminGamesOverview'
import { AdminGamesPuzzles } from './AdminGamesPuzzles'
import { AdminGamesSettingsForm } from './AdminGamesSettingsForm'
import { AdminMurekWardrobe } from './AdminMurekWardrobe'
import { txa } from '@/i18n/activeLocale'

/* Admin > Games: Game Corner data and rules in one place. */

type GamesTab = 'overview' | 'puzzles' | 'settings' | 'murek' | 'events'

const TAB_OPTIONS: Array<{ value: GamesTab, label: string, icon: LucideIcon }> = [
  { value: 'overview', get label() { return txa('Genel bakış') }, icon: LayoutDashboard },
  { value: 'puzzles', get label() { return txa('Bulmacalar') }, icon: CalendarDays },
  { value: 'settings', get label() { return txa('Kurallar') }, icon: Gamepad2 },
  { value: 'murek', get label() { return txa('Mürek dolabı') }, icon: Shirt },
  { value: 'events', get label() { return txa('Etkinlikler') }, icon: Trophy },
]

export default function AdminGamesSection() {
  const [tab, setTab] = useState<GamesTab>('overview')
  const [overview, setOverview] = useState<DailyGamesOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setOverview(await getAdminDailyGamesOverview(14))
    } catch (loadError) {
      setError(loadError instanceof Error ? txa(loadError.message) : txa('Oyun verisi yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <section className='flex flex-col gap-4' data-testid='admin-games-section'>
      <AdminSectionHeader
        title={txa('Oyunlar')}
        description={txa('Oyun Köşesi istatistikleri, bulmaca takvimi ve oyun kuralları.')}
        actions={<Button type='button' variant='outline' size='sm' className='h-9 gap-1.5 rounded-full px-3.5' onClick={() => void load()} disabled={loading}><RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />{txa('Yenile')}</Button>}
      />
      <nav aria-label={txa('Oyun bölümleri')}>
        <div className='flex w-fit max-w-full flex-wrap gap-0.5 rounded-xl bg-muted/60 p-1' role='tablist'>
          {TAB_OPTIONS.map((option) => (
            <button
              key={option.value}
              type='button'
              role='tab'
              aria-selected={tab === option.value}
              onClick={() => setTab(option.value)}
              data-testid={`admin-games-tab-${option.value}`}
              className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors', tab === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              <option.icon className='size-3.5' />{option.label}
            </button>
          ))}
        </div>
      </nav>
      {tab === 'murek' ? (
        <AdminMurekWardrobe />
      ) : tab === 'events' ? (
        <AdminEventArchive />
      ) : error ? (
        <p className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>{error}</p>
      ) : !overview ? (
        <AdminSectionSkeleton variant='dashboard' />
      ) : tab === 'overview' ? (
        <AdminGamesOverview overview={overview} />
      ) : tab === 'puzzles' ? (
        <AdminGamesPuzzles overview={overview} onChanged={() => void load()} />
      ) : (
        <AdminGamesSettingsForm
          key={overview.settings.updatedAt ?? 'settings'}
          settings={overview.settings}
          onSaved={(settings) => setOverview((current) => (current ? { ...current, settings } : current))}
        />
      )}
    </section>
  )
}
