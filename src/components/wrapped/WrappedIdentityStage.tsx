import type { WrappedPersonaProfile } from '@/services/wrappedPersonaService'
import { txa } from '@/i18n/activeLocale'

interface WrappedIdentityStageProps {
    persona: WrappedPersonaProfile
}

function WrappedIdentityStage({ persona }: WrappedIdentityStageProps) {
    return (
        <section className="rounded-lg border-[3px] border-black bg-gradient-to-br from-[#0f1b31] via-[#1c3155] to-[#243c67] p-4 text-white shadow-comic">
            <header className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="m-0 text-2xl text-primary">{txa('Okuyucu Kimliği')}</h2>
                <span className="rounded-full border border-white/35 bg-white/10 px-2 py-1 text-xs">
                    {persona.auraLevel}
                </span>
            </header>

            <article className="rounded-md border-2 border-black bg-black/25 p-3">
                <p className="m-0 mb-1.5 text-xs uppercase tracking-[0.08em] text-white/80">
                    {persona.seasonTitle}
                </p>
                <h3 className="m-0 text-2xl text-white">{persona.archetypeTitle}</h3>
                <p className="m-0 mt-2 text-sm text-white/90">{persona.archetypeDescription}</p>
            </article>

            <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs text-white/82">{txa('Aura Gücü')}</span>
                    <strong className="text-base text-primary">{`${persona.auraScore}/100`}</strong>
                </div>
                <div className="h-3 overflow-hidden rounded-full border border-white/35 bg-white/20">
                    <i
                        className="block h-full bg-gradient-to-r from-[#ffd600] to-[#ffe682]"
                        style={{ width: `${persona.auraScore}%` }}
                    />
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {persona.signatureTags.map((tag) => (
                    <span
                        key={tag}
                        className="rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white"
                    >
                        {tag}
                    </span>
                ))}
            </div>
        </section>
    )
}

export default WrappedIdentityStage
