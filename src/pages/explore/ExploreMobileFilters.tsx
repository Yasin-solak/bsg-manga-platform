import { useState } from 'react'
import BottomSheet from '@/components/common/BottomSheet'
import { cn } from '@/lib/utils'
import { STATUS_OPTIONS, type ExploreStatusId, type ExploreGenreItem } from './explorePageShared'
import { txa } from '@/i18n/activeLocale'

export function ExploreMobileFilters({ genres, selectedGenres, selectedStatus, onApply, onClose }: {
  genres: ExploreGenreItem[]; selectedGenres: string[]; selectedStatus: ExploreStatusId
  onApply: (genres: string[], status: ExploreStatusId) => void; onClose: () => void
}) {
  const [draftGenres, setDraftGenres] = useState(selectedGenres)
  const [draftStatus, setDraftStatus] = useState(selectedStatus)
  return <BottomSheet open onOpenChange={open => { if (!open) onClose() }} title={txa('Filtrele')} titleTone="heading"
    description={txa('Tür ve durum seç. Sonuçları göster düğmesi seçimlerini uygular; vazgeçersen mevcut filtreler korunur.')}
    cancelLabel={null} contentClassName="max-h-[88dvh]" testId="explore-mobile-filters">
    <div className="flex justify-between px-5 pt-2">
      <button className="min-h-11 text-xs font-bold text-primary" onClick={() => { setDraftGenres([]); setDraftStatus('all') }}>{txa('Sıfırla')}</button>
      <button className="min-h-11 text-xs font-bold" onClick={onClose}>{txa('Vazgeç')}</button>
    </div>
    <div className="min-h-0 overflow-y-auto px-5 pb-4">
      <h3 className="text-xs font-bold uppercase text-muted-foreground">{txa('Tür')}</h3>
      <div className="mt-2 flex flex-wrap gap-2">{genres.map(g => <button key={g.id} aria-pressed={draftGenres.includes(g.id)}
        onClick={() => setDraftGenres(current => current.includes(g.id) ? current.filter(id => id !== g.id) : [...current, g.id])}
        className={cn('min-h-11 rounded-xl border px-3.5 text-[13px] font-bold', draftGenres.includes(g.id) ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>{txa(g.name)}</button>)}</div>
      <h3 className="mt-6 text-xs font-bold uppercase text-muted-foreground">{txa('Durum')}</h3>
      <div className="mt-2 flex flex-wrap gap-2">{STATUS_OPTIONS.map(s => <button key={s.id} aria-pressed={draftStatus === s.id}
        onClick={() => setDraftStatus(s.id)} className={cn('min-h-11 rounded-xl border px-3.5 text-[13px] font-bold', draftStatus === s.id ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>{txa(s.name)}</button>)}</div>
    </div>
    <button className="mx-4 mb-[calc(1rem+env(safe-area-inset-bottom))] mt-2 min-h-[52px] shrink-0 rounded-[14px] bg-primary text-[15px] font-bold text-primary-foreground"
      onClick={() => onApply(draftGenres, draftStatus)}>{txa('Sonuçları göster')}</button>
  </BottomSheet>
}
