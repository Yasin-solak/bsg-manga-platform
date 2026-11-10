import type { WrappedStorySlide } from './wrappedUiTypes'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface WrappedStoryDeckProps {
    slides: WrappedStorySlide[]
    loading: boolean
    storyIndex: number
    autoPlay: boolean
    onSelectStory: (nextIndex: number) => void
    onPrev: () => void
    onNext: () => void
    onToggleAutoPlay: () => void
}

const THEME_GRADIENTS: Record<string, string> = {
    flare: 'linear-gradient(135deg, #9e1111 0%, #cf3a1b 45%, #d78b15 100%)',
    cyber: 'linear-gradient(135deg, #001e3c 0%, #004f90 45%, #02a9f4 100%)',
    sunset: 'linear-gradient(135deg, #6e1a7a 0%, #b63850 50%, #f56d2b 100%)',
    mint: 'linear-gradient(135deg, #0e3a3f 0%, #137f7f 50%, #2dcf9f 100%)',
    violet: 'linear-gradient(135deg, #2c1f66 0%, #5e30a8 48%, #9f57d6 100%)',
}

function WrappedStoryDeck({
    slides,
    loading,
    storyIndex,
    autoPlay,
    onSelectStory,
    onPrev,
    onNext,
    onToggleAutoPlay,
}: WrappedStoryDeckProps) {
    const activeSlide = slides[storyIndex] || null
    const progressPercent = slides.length > 0 ? ((storyIndex + 1) / slides.length) * 100 : 0

    return (
        <section className="rounded-lg border-[3px] border-black bg-[#111318] p-4 text-white shadow-comic">
            <header className="mb-2 flex items-center justify-between">
                <h2 className="m-0 text-2xl text-primary">{txa('Story Mode')}</h2>
                <span className="text-xs text-white/76">{slides.length > 0 ? `${storyIndex + 1}/${slides.length}` : '0/0'}</span>
            </header>

            <div className="h-2 overflow-hidden rounded-full border border-white/35 bg-white/10">
                <i
                    className="block h-full bg-gradient-to-r from-[#ffd600] via-[#ffc400] to-[#ffef99]"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>

            {loading && !activeSlide ? (
                <div className="mt-3 flex min-h-[340px] items-center justify-center overflow-hidden rounded-lg border-2 border-black bg-white/5">
                    <div className="h-full w-full animate-wrapped-shimmer bg-gradient-to-r from-white/5 via-white/25 to-white/5" />
                </div>
            ) : activeSlide ? (
                <article
                    className="animate-wrapped-card-in relative mt-3 min-h-[360px] overflow-hidden rounded-lg border-2 border-black p-[clamp(18px,3vw,34px)] max-[860px]:min-h-[300px]"
                    style={{
                        background: THEME_GRADIENTS[activeSlide.theme] ?? THEME_GRADIENTS.flare,
                    }}
                >
                    {activeSlide.backgroundImageUrl && (
                        <div className="absolute inset-0 z-0">
                            <img
                                src={activeSlide.backgroundImageUrl}
                                alt={activeSlide.title}
                                loading="lazy"
                                className="h-full w-full object-cover [filter:blur(1.8px)_saturate(1.12)_brightness(0.58)] [transform:scale(1.04)]"
                            />
                        </div>
                    )}
                    <div
                        className="pointer-events-none absolute inset-0 z-0 opacity-45"
                        style={{
                            backgroundImage:
                                'radial-gradient(circle at 22% 18%, rgba(255,255,255,0.12) 0px, transparent 2px), radial-gradient(circle at 78% 72%, rgba(255,255,255,0.09) 0px, transparent 2px)',
                            backgroundSize: '36px 36px',
                        }}
                    />
                    <p className="relative z-10 inline-flex rounded-full border-2 border-black/40 bg-black/30 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.11em] text-[#fff7b3]">
                        {activeSlide.kicker}
                    </p>
                    <h3 className="relative z-10 mx-0 my-1.5 mt-1.5 text-[clamp(1.4rem,2.9vw,2.2rem)] text-white">
                        {activeSlide.title}
                    </h3>
                    <p className="relative z-10 m-0 max-w-[720px] text-white/92">{activeSlide.description}</p>
                    <div className="relative z-10 mt-4 flex flex-col gap-1">
                        <strong className="text-[clamp(2rem,5vw,3.4rem)] leading-[1.05] text-white [text-shadow:0_1px_0_rgba(0,0,0,0.38)]">
                            {activeSlide.primaryValue}
                        </strong>
                        {activeSlide.secondaryValue && (
                            <span className="text-sm text-white/88">{activeSlide.secondaryValue}</span>
                        )}
                    </div>
                    {activeSlide.quote && (
                        <blockquote className="relative z-10 mt-3 border-l-[3px] border-primary py-2 pl-2.5 text-sm italic text-white/95">
                            {activeSlide.quote}
                        </blockquote>
                    )}
                    {activeSlide.stats && activeSlide.stats.length > 0 && (
                        <div className="relative z-10 mt-4 grid grid-cols-3 gap-2.5 max-[860px]:grid-cols-1">
                            {activeSlide.stats.map((stat) => (
                                <div
                                    key={`${activeSlide.id}-${stat.label}`}
                                    className="flex min-h-[76px] flex-col justify-center gap-1 rounded-md border-2 border-black/35 bg-black/25 p-2.5"
                                >
                                    <span className="text-xs text-white/78">{stat.label}</span>
                                    <strong className="break-words text-lg text-[#fff9cb]">{stat.value}</strong>
                                </div>
                            ))}
                        </div>
                    )}
                    {activeSlide.chips && activeSlide.chips.length > 0 && (
                        <div className="relative z-10 mt-3 flex flex-wrap gap-2">
                            {activeSlide.chips.map((chip) => (
                                <span
                                    key={`${activeSlide.id}-${chip}`}
                                    className="rounded-full border border-black/50 bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white"
                                >
                                    {chip}
                                </span>
                            ))}
                        </div>
                    )}
                </article>
            ) : (
                <div className="mt-3 flex min-h-[340px] items-center justify-center rounded-lg border-2 border-black bg-white/5">
                    <p className="m-0 text-sm text-white/86">{txa('Story verisi bulunamadı.')}</p>
                </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 max-[620px]:flex-wrap">
                <button
                    type="button"
                    className="min-w-[88px] flex-1 rounded-md border-2 border-black bg-primary px-3 py-2 font-heading text-black disabled:cursor-not-allowed disabled:opacity-55 max-[620px]:flex-1 max-[620px]:basis-0"
                    onClick={onPrev}
                    disabled={slides.length === 0 || storyIndex === 0}
                >
                    {txa('Geri')}
                </button>
                <div className="flex gap-2">
                    {slides.map((slide, index) => (
                        <button
                            key={slide.id}
                            type="button"
                            className={cn(
                                'h-[11px] rounded-full border border-white/45 transition-all',
                                index === storyIndex
                                    ? 'w-7 border-primary bg-primary'
                                    : 'w-[11px] bg-white/25',
                            )}
                            onClick={() => onSelectStory(index)}
                            aria-label={`${index + 1}. story`}
                        />
                    ))}
                </div>
                <button
                    type="button"
                    className="min-w-[88px] flex-1 rounded-md border-2 border-black bg-primary px-3 py-2 font-heading text-black disabled:cursor-not-allowed disabled:opacity-55 max-[620px]:flex-1 max-[620px]:basis-0"
                    onClick={onNext}
                    disabled={slides.length === 0 || storyIndex >= slides.length - 1}
                >
                    {txa('İleri')}
                </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <button
                    type="button"
                    className={cn(
                        'rounded-md border-2 border-black px-3 py-1.5 font-heading text-white',
                        autoPlay ? 'bg-primary text-[#1a1a1a]' : 'bg-white/10',
                    )}
                    onClick={onToggleAutoPlay}
                    disabled={slides.length < 2}
                >
                    {autoPlay ? txa('Oto Oynatma Açık') : txa('Oto Oynatma Kapalı')}
                </button>
                <p className="m-0 text-xs text-white/72">
                    {txa('Ipucu: Sol ve sag ok tuslariyla hizli story gecisi yapabilirsin.')}
                </p>
            </div>
        </section>
    )
}

export default WrappedStoryDeck
