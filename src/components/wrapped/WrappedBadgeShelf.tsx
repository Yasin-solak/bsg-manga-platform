import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface WrappedBadgeShelfProps {
    badges: string[]
}

const BADGE_TONE_STYLES: Record<string, string> = {
    amber: 'bg-gradient-to-br from-[#9c5f0e] to-[#d18a1b]',
    cyan: 'bg-gradient-to-br from-[#0d4f66] to-[#2490b5]',
    rose: 'bg-gradient-to-br from-[#7b1f43] to-[#bf3c77]',
    mint: 'bg-gradient-to-br from-[#0f5a4a] to-[#31a88a]',
    violet: 'bg-gradient-to-br from-[#3e216f] to-[#7f4cc8]',
}

function getBadgeTone(index: number) {
    const tones = ['amber', 'cyan', 'rose', 'mint', 'violet']
    return tones[index % tones.length]
}

function WrappedBadgeShelf({ badges }: WrappedBadgeShelfProps) {
    return (
        <section className="rounded-lg border-[3px] border-black bg-gradient-to-br from-[#c62828] via-[#ab1f20] to-[#8e1a1d] p-4 text-white shadow-comic">
            <header className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="m-0 text-2xl text-primary">{txa('Başarı Vitrini')}</h2>
                <span className="text-xs text-white/80">{txa('{v1} rozet', { v1: badges.length })}</span>
            </header>
            {badges.length === 0 ? (
                <p className="m-0 text-white/90">{txa('Bu dönem için rozet oluşmadı.')}</p>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
                    {badges.map((badge, index) => (
                        <article
                            key={`${badge}-${index}`}
                            className={cn(
                                'flex min-h-[112px] flex-col justify-center gap-1 rounded-md border-2 border-black p-2.5',
                                BADGE_TONE_STYLES[getBadgeTone(index)] ?? BADGE_TONE_STYLES.amber,
                            )}
                        >
                            <div className="w-fit rounded-full border border-black/50 bg-black/20 px-2 py-0.5 text-[11px] font-bold">
                                {`#${index + 1}`}
                            </div>
                            <strong className="text-base">{badge}</strong>
                            <span className="text-xs text-white/82">{txa('Wrapped Rozeti')}</span>
                        </article>
                    ))}
                </div>
            )}
        </section>
    )
}

export default WrappedBadgeShelf
