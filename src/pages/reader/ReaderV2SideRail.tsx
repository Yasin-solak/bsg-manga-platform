/**
 * Quick settings rail in the empty edges in page mode.
 *
 * In page mode the image scales to fit vertically, so wide screens have large black areas
 * on both sides. User feedback: settings panel options could go in those areas.
 * The most frequently changed ones came here
 * (mode, fit, zoom); the full list stays in the settings panel.
 *
 * Drawn only when there is REALLY edge space: not visible on narrow screens or in strip
 * mode, where it would overlap content.
 */

import { Columns2, Maximize, Minus, Plus, Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReaderV2FitMode, ReaderV2ModePreference } from '@/pages/reader/readerV2LayoutEngine'
import { READER_V2_ZOOM_LEVELS, type ReaderV2Preferences } from '@/pages/reader/readerV2Preferences'
import { txa } from '@/i18n/activeLocale'

interface ReaderV2SideRailProps {
  visible: boolean
  preferences: ReaderV2Preferences
  onChange: (patch: Partial<ReaderV2Preferences>) => void
}

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    // The NAME also shows on hover (user request): icons alone did not explain
    // what they do. The label opens leftward and the rail itself does not widen,
    // so it does not overlap content.
    <div className="group/rail relative flex justify-end">
      <span
        aria-hidden
        className="pointer-events-none absolute right-full top-1/2 mr-2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-neutral-950/95 px-2 py-1 text-[11px] text-white/85 shadow-lg group-hover/rail:block"
      >
        {label}
      </span>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'flex size-9 items-center justify-center rounded-xl border transition-colors',
          active
            ? 'border-primary/50 bg-primary/20 text-primary'
            : 'border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.09] hover:text-white',
        )}
      >
        {children}
      </button>
    </div>
  )
}

const MODE_ITEMS: Array<{ value: ReaderV2ModePreference; label: string; icon: React.ReactNode }> = [
  { value: 'strip', get label() { return txa('Serit (dikey akis)') }, icon: <Rows3 className="size-4" /> },
  { value: 'page', get label() { return txa('Sayfa (yatay)') }, icon: <Columns2 className="size-4" /> },
]

const FIT_ITEMS: Array<{ value: ReaderV2FitMode; label: string }> = [
  { value: 'width', get label() { return txa('Genislige sigdir') } },
  { value: 'height', get label() { return txa('Yukseklige sigdir') } },
]

export function ReaderV2SideRail({ visible, preferences, onChange }: ReaderV2SideRailProps) {
  if (!visible) return null

  const zoomIndex = READER_V2_ZOOM_LEVELS.indexOf(preferences.zoomLevel)
  const stepZoom = (direction: 1 | -1) => {
    const nextIndex = Math.min(Math.max(zoomIndex + direction, 0), READER_V2_ZOOM_LEVELS.length - 1)
    onChange({ zoomLevel: READER_V2_ZOOM_LEVELS[nextIndex] })
  }

  return (
    <aside
      data-testid="reader-v2-side-rail"
      aria-label={txa('Hizli okuyucu ayarlari')}
      // Sahnenin uzerinde ama panellerin altinda; kenar bosluguna oturur.
      className="pointer-events-auto absolute right-3 top-1/2 z-[9050] hidden -translate-y-1/2 flex-col gap-1.5 rounded-2xl border border-white/10 bg-black/55 p-1.5 backdrop-blur xl:flex"
    >
      {MODE_ITEMS.map((item) => (
        <RailButton
          key={item.value}
          label={item.label}
          active={preferences.modePreference === item.value}
          onClick={() => onChange({ modePreference: item.value })}
        >
          {item.icon}
        </RailButton>
      ))}

      <span className="mx-auto my-0.5 h-px w-5 bg-white/10" />

      {FIT_ITEMS.map((item) => (
        <RailButton
          key={item.value}
          label={item.label}
          active={preferences.fitMode === item.value}
          onClick={() => onChange({ fitMode: item.value })}
        >
          <Maximize className={cn('size-4', item.value === 'height' && 'rotate-90')} />
        </RailButton>
      ))}

      <span className="mx-auto my-0.5 h-px w-5 bg-white/10" />

      <RailButton label={txa('Uzaklastir')} onClick={() => stepZoom(-1)}>
        <Minus className="size-4" />
      </RailButton>
      <span className="text-center text-[10px] tabular-nums text-white/45">{txa('%{v1}', { v1: preferences.zoomLevel })}</span>
      <RailButton label={txa('Yakinlastir')} onClick={() => stepZoom(1)}>
        <Plus className="size-4" />
      </RailButton>
    </aside>
  )
}

export default ReaderV2SideRail
