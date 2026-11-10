/**
 * Closing strip preview: inside a reader page skeleton.
 *
 * Top bar, last pages of the chapter (skeleton), an "end of chapter" divider, the real
 * ChapterEndCreditRail, next chapter button and comment skeleton. In mobile mode a
 * phone frame; on desktop drawn at reader column width.
 */
import { DeviceMobile, Monitor } from '@phosphor-icons/react'
import ChapterEndCreditRail from '@/components/fansub/ChapterEndCreditRail'
import type { ChapterCreditPresentation } from '@/components/fansub/chapterCreditPresentation'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

type ChapterCreditPreviewPanelProps = {
  presentation: ChapterCreditPresentation
  previewMode: 'desktop' | 'mobile'
  onPreviewModeChange: (mode: 'desktop' | 'mobile') => void
}

function Bar({ className }: { className?: string }) {
  return <span className={cn('block rounded-full bg-white/[0.08]', className)} />
}

export default function ChapterCreditPreviewPanel({
  presentation,
  previewMode,
  onPreviewModeChange,
}: ChapterCreditPreviewPanelProps) {
  const mobile = previewMode === 'mobile'
  return (
    <section className="rounded-[20px] border border-border/70 bg-card/60 p-4" data-testid="chapter-credit-preview">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span>
          <span className="block text-[15px] font-bold">{txa('Okuyucuda böyle görünür')}</span>
          <span className="block text-[12px] text-muted-foreground">{txa('Bölümün son sayfasından sonra, yorumların hemen üstünde.')}</span>
        </span>
        <div className="flex flex-none rounded-full border border-border/70 p-0.5" role="tablist" aria-label={txa('Önizleme cihazı')}>
          {([['desktop', Monitor, txa('Masaüstü')], ['mobile', DeviceMobile, txa('Mobil')]] as const).map(([mode, IconCmp, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={previewMode === mode}
              onClick={() => onPreviewModeChange(mode)}
              className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold', previewMode === mode ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            >
              <IconCmp size={13} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn('mx-auto overflow-hidden bg-[#0b0b0f] text-white transition-all', mobile ? 'max-w-[340px] rounded-[28px] border-[6px] border-zinc-800' : 'rounded-2xl border border-white/10')} aria-hidden="true">
        {/* Okuyucu ust cubugu */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
          <span className="size-6 rounded-full bg-white/[0.08]" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Bar className="h-2 w-28" />
            <Bar className="h-1.5 w-16 bg-white/[0.05]" />
          </span>
          <Bar className="h-5 w-14" />
        </div>

        {/* Son sayfalar */}
        <div className={cn('mx-auto flex flex-col gap-1 pt-1', mobile ? 'w-full' : 'w-[82%]')}>
          <div className="h-20 rounded-b-md bg-gradient-to-b from-white/[0.04] to-white/[0.09]" />
          <div className="relative h-44 overflow-hidden rounded-md bg-white/[0.07]">
            <span className="absolute left-[12%] top-[18%] h-[38%] w-[34%] rounded-xl bg-white/[0.06]" />
            <span className="absolute right-[10%] top-[30%] h-[22%] w-[30%] rounded-full bg-white/[0.06]" />
            <span className="absolute bottom-[12%] left-[20%] h-3 w-[46%] rounded-full bg-white/[0.08]" />
          </div>
        </div>

        <div className={cn('mx-auto py-5', mobile ? 'px-3' : 'w-[82%]')}>

          <ChapterEndCreditRail presentation={presentation} compact={mobile} />

          <div className="mt-4 flex gap-2">
            <span className="flex h-9 flex-1 items-center justify-center rounded-xl bg-white/[0.06] text-[11px] font-semibold text-white/40">{txa('Önceki bölüm')}</span>
            <span className="flex h-9 flex-1 items-center justify-center rounded-xl bg-white/[0.12] text-[11px] font-semibold text-white/60">{txa('Sonraki bölüm')}</span>
          </div>

          {/* Yorum iskeleti */}
          <div className="mt-6 flex flex-col gap-3">
            <Bar className="h-2.5 w-20" />
            {[0, 1].map((index) => (
              <div key={index} className="flex gap-2.5">
                <span className="size-7 flex-none rounded-full bg-white/[0.08]" />
                <span className="flex flex-1 flex-col gap-1.5 pt-1">
                  <Bar className="h-2 w-24" />
                  <Bar className={cn('h-2 bg-white/[0.05]', index ? 'w-1/2' : 'w-4/5')} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
