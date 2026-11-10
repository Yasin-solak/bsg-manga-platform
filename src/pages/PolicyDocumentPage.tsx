import { useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import { Info, LifeBuoy, ListTree, Link2 } from 'lucide-react'
import { getPolicyDocumentByKey, type PolicyDocumentKey } from '@/content/policies'
import { CONTACT_PATH, POLICY_HUB_PATH } from '@/lib/policyRoutes'
import { cn } from '@/lib/utils'
import { PolicyAsideCard, PolicyLinkList, PolicyPageShell } from '@/components/policies/PolicyPageShell'
import { getActiveLocale, txa } from '@/i18n/activeLocale'

interface PolicyDocumentPageProps {
  documentKey: PolicyDocumentKey
}

// Scrollspy for the table of contents: the visible section highest on the page counts as active.
function useActiveSectionId(sectionIds: string[]) {
  const [activeId, setActiveId] = useState<string | null>(sectionIds[0] ?? null)

  useEffect(() => {
    if (typeof window === 'undefined' || sectionIds.length === 0) return

    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = sectionIds.find((id) => visible.has(id))
        if (first) setActiveId(first)
      },
      { rootMargin: '-96px 0px -55% 0px' },
    )

    for (const id of sectionIds) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [sectionIds])

  return activeId
}

function PolicyDocumentPage({ documentKey }: PolicyDocumentPageProps) {
  const policyDocument = getPolicyDocumentByKey(documentKey)
  const sectionIds = policyDocument?.sections.map((section) => section.id) ?? []
  const activeId = useActiveSectionId(sectionIds)

  if (!policyDocument) {
    return null
  }

  return (
    <PolicyPageShell
      eyebrow={policyDocument.eyebrow}
      title={policyDocument.title}
      summary={policyDocument.summary}
      meta={[
        { label: txa('Yürürlük'), value: policyDocument.effectiveDate },
        { label: txa('Son güncelleme'), value: policyDocument.updatedDate },
        { label: txa('Kapsam'), value: policyDocument.audience },
      ]}
      aside={(
        <div className="space-y-4">
          <PolicyAsideCard title={txa('İçindekiler')} icon={<ListTree />}>
            <nav className="space-y-1">
              {getActiveLocale() === 'en' ? (
                <p className="mb-6 rounded-lg border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground" data-testid="policy-binding-note">
                  {txa('This English version is provided for information only. The Turkish text is legally binding.')}
                </p>
              ) : null}
              {policyDocument.sections.map((section, index) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className={cn(
                    'flex items-baseline gap-2.5 rounded-xl border border-transparent px-3 py-2 text-sm transition-colors',
                    activeId === section.id
                      ? 'border-primary/30 bg-primary/[0.08] font-semibold text-primary'
                      : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                  )}
                >
                  <span className={cn(
                    'text-[11px] font-black tabular-nums',
                    activeId === section.id ? 'text-primary' : 'text-muted-foreground/50',
                  )}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0">{section.title}</span>
                </a>
              ))}
            </nav>
          </PolicyAsideCard>
          <PolicyAsideCard title={txa('İlgili bağlantılar')} icon={<Link2 />}>
            <PolicyLinkList links={policyDocument.relatedLinks} />
          </PolicyAsideCard>
          <PolicyAsideCard title={txa('Başvuru ve destek')} icon={<LifeBuoy />}>
            <p className="text-sm leading-6 text-muted-foreground">
              {txa('Belirli bir madde hakkında resmi destek veya inceleme talebi oluşturmak için ilgili kanalı kullanın.')}
            </p>
            <PolicyLinkList
              links={[
                { label: txa('İletişim ve Hata Bildir'), to: CONTACT_PATH },
                { label: txa('Kurallar ve Politikalar Merkezi'), to: POLICY_HUB_PATH },
              ]}
            />
          </PolicyAsideCard>
        </div>
      )}
    >
      <article className="rounded-[28px] border border-border/70 bg-card/95 px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.07] px-4 py-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm leading-6 text-foreground/80">
            {txa('Bu metin resmi kullanim ve yonetisim standardini aciklar. Gerektiginde')}{' '}
            <Link to={CONTACT_PATH} className="font-semibold text-primary underline-offset-4 hover:underline">{txa('destek')}</Link>
            {' '}{txa('kanali uzerinden ek basvuru yapabilirsiniz.')}
          </p>
        </div>

        <div className="space-y-10">
          {policyDocument.sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-black tabular-nums text-primary/70">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h2 className="text-xl font-black tracking-tight text-foreground sm:text-[1.35rem]">
                  {section.title}
                </h2>
              </div>
              <div className="mt-3 border-l-2 border-primary/25 pl-4 sm:ml-1.5 sm:pl-6">
                {section.summary ? (
                  <p className="text-[15px] font-medium leading-7 text-foreground/85">
                    {section.summary}
                  </p>
                ) : null}
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-[15px] leading-7 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
                {section.bullets?.length ? (
                  <ul className="mt-4 space-y-2.5">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3 text-[15px] leading-6 text-muted-foreground">
                        <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-primary/70" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </article>
    </PolicyPageShell>
  )
}

export default PolicyDocumentPage
