import { useTx } from '@/i18n/LocaleProvider'
export function HomeRecommendationSkeleton({ minHeight }: { minHeight?: number }) {
  const tx = useTx()
  return <div className="dh-recommend-body" role="status" aria-label={tx('Öneriler yükleniyor')} style={{ minHeight }}>
    <div className="dh-recommend-hero" aria-hidden="true">
      <span className="dh-recommend-skeleton-cover dh-skeleton" />
      <div>
        <span className="dh-skeleton h-3 w-2/3" />
        <span className="dh-skeleton mt-3 h-8 w-4/5" />
        <span className="dh-skeleton mt-3 h-3 w-3/5" />
        <span className="dh-skeleton mt-5 h-3 w-full" />
        <span className="dh-skeleton mt-2 h-3 w-5/6" />
        <span className="dh-skeleton mt-auto h-10 w-20 self-end" />
      </div>
    </div>
    <div className="dh-recommend-list" aria-hidden="true">{[0, 1, 2, 3].map(index => <div className="dh-recommend-placeholder" key={index}>
      <span className="dh-skeleton h-5 w-5 shrink-0" />
      <span className="dh-skeleton h-[51px] w-[38px] shrink-0" />
      <div className="flex-1"><span className="dh-skeleton block h-3 w-4/5" /><span className="dh-skeleton mt-2 block h-3 w-3/5" /></div>
    </div>)}</div>
  </div>
}
