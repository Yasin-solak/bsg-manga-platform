import type { WrappedPeriod } from '@/services/wrappedService'
import type { WrappedPeriodOption } from './wrappedUiTypes'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface WrappedHeroControlsProps {
    avatarUrl: string
    username: string
    periodLabel: string
    period: WrappedPeriod
    periodOptions: readonly WrappedPeriodOption[]
    loading: boolean
    onPeriodChange: (period: WrappedPeriod) => void
    onRefresh: () => void
    onCopy: () => void
}

function WrappedHeroControls({
    avatarUrl,
    username,
    periodLabel,
    period,
    periodOptions,
    loading,
    onPeriodChange,
    onRefresh,
    onCopy,
}: WrappedHeroControlsProps) {
    return (
        <section className="flex flex-wrap justify-between gap-4 rounded-lg border-[3px] border-black bg-gradient-to-br from-[#c62828] via-[#a91f20] to-[#6f151b] p-5 text-white shadow-comic max-[720px]:p-4">
            <div className="flex min-w-0 items-center gap-3">
                <img loading="lazy" decoding="async"
                    src={avatarUrl}
                    alt={username}
                    className="h-20 w-20 shrink-0 rounded-full border-[3px] border-black object-cover bg-[#111] max-[720px]:h-[68px] max-[720px]:w-[68px]"
                />
                <div className="min-w-0">
                    <p className="m-0 mb-1.5 text-xs uppercase tracking-[0.08em] text-white/84">
                        {txa('BSG Manga Wrapped')}
                    </p>
                    <h1 className="m-0 text-[clamp(1.5rem,2.7vw,2.15rem)] text-primary">
                        {txa('{v1} için sezon özeti', { v1: username })}
                    </h1>
                    <p className="m-0 mt-2 text-white/90">{periodLabel}</p>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <div className="inline-flex flex-wrap items-center gap-2">
                    {periodOptions.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={cn(
                                'rounded-md border-2 border-black px-3 py-2 font-heading tracking-wide',
                                period === option.value
                                    ? 'bg-primary text-black shadow-[2px_2px_0_black]'
                                    : 'bg-black/30 text-white',
                                loading && 'cursor-not-allowed opacity-70',
                            )}
                            onClick={() => onPeriodChange(option.value)}
                            disabled={loading}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <div className="inline-flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="rounded-md border-2 border-black bg-white/10 px-3 py-2 font-heading tracking-wide text-white hover:bg-white/20"
                        onClick={onRefresh}
                        disabled={loading}
                    >
                        {loading ? txa('Yenileniyor...') : txa('Yenile')}
                    </button>
                    <button
                        type="button"
                        className="rounded-md border-2 border-black bg-white/10 px-3 py-2 font-heading tracking-wide text-white hover:bg-white/20"
                        onClick={onCopy}
                    >
                        {txa('Özeti Kopyala')}
                    </button>
                </div>
            </div>
        </section>
    )
}

export default WrappedHeroControls
