import { useMemo } from 'react'
import { FileWarning, Scale, ScrollText, ShieldCheck } from 'lucide-react'
import { PolicyAsideCard, PolicyLinkList, PolicyPageShell } from '@/components/policies/PolicyPageShell'
import { LegalRequestForm } from '@/components/policies/LegalRequestForm'
import { getPolicyDocumentByKey } from '@/content/policies'
import { CONTACT_PATH, COPYRIGHT_POLICY_PATH, DMCA_PATH, POLICY_HUB_PATH } from '@/lib/policyRoutes'
import type { LegalRequestType } from '@/services/legalRequestService'
import { txa } from '@/i18n/activeLocale'

interface LegalRequestCenterPageProps {
  defaultType?: LegalRequestType
}

function LegalRequestCenterPage({ defaultType = 'copyright' }: LegalRequestCenterPageProps) {
  const copyrightDocument = getPolicyDocumentByKey('copyright')

  const title = defaultType === 'dmca' ? txa('DMCA ve Telif Bildirim Merkezi') : txa('Telif ve İçerik Kaldırma Merkezi')
  const summary = defaultType === 'dmca'
    ? txa('DMCA, telif, marka ve yanlış temsil taleplerini aynı resmi merkezden açabilirsiniz. Formlar destek kutusuna değil, doğrudan admin paneldeki yasal talepler kuyruğuna düşer.')
    : txa('Telif, marka, taklit ve içerik kaldırma taleplerini aynı resmi merkezden açabilirsiniz. Kullanıcıyı başka forma savurmadan tek yerden ilerler.')

  const processCards = useMemo(() => ([
    {
      icon: FileWarning,
      title: txa('Hedef bağlantıları net girin'),
      description: txa('İnceleme ekibi içeriği URL bazlı ele alır. Her satıra tek hedef bağlantısı ekleyin.'),
    },
    {
      icon: Scale,
      title: txa('Beyanlar zorunludur'),
      description: txa('DMCA ve telif başvuruları iyi niyet, yetki ve doğruluk beyanları olmadan işleme alınmaz.'),
    },
    {
      icon: ShieldCheck,
      title: txa('Ayrık hukuk kuyruğu'),
      description: txa('Bu talepler normal kullanıcı raporlarından ayrıdır ve admin panelde ayrı yasal talepler sekmesine düşer.'),
    },
  ]), [])

  return (
    <PolicyPageShell
      eyebrow={txa('Yasal Talep')}
      title={title}
      summary={summary}
      icon={<Scale className="size-5" />}
      meta={[
        { label: txa('Kullanım'), value: txa('Misafir ve girişli kullanıcılara açık') },
        { label: txa('Teslim noktasi'), value: txa('Admin > Yasal Talepler') },
        { label: txa('Kapsam'), value: txa('DMCA, telif, marka, taklit ve yanlış temsil') },
      ]}
      aside={(
        <div className="space-y-4">
          <PolicyAsideCard title={txa('Hızlı erişim')}>
            <PolicyLinkList
              links={[
                { label: txa('Telif ve İçerik Kaldırma'), to: COPYRIGHT_POLICY_PATH },
                { label: txa('DMCA Bildirimi'), to: DMCA_PATH },
                { label: txa('Kurallar ve Politikalar Merkezi'), to: POLICY_HUB_PATH },
                { label: txa('İletişim ve Hata Bildir'), to: CONTACT_PATH },
              ]}
            />
          </PolicyAsideCard>
          <PolicyAsideCard title={txa('İşleyiş özeti')}>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              <li className="flex items-start gap-3">
                <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                {txa('Talep kaydı oluşturulur.')}
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                {txa('Admin yasal talep kuyruğuna düşer.')}
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                {txa('Gerekirse ek bilgi istenir veya islem uygulanir.')}
              </li>
            </ul>
          </PolicyAsideCard>
        </div>
      )}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-3">
          {processCards.map((card) => (
            <article key={card.title} className="rounded-[24px] border border-border/70 bg-card/95 p-5 shadow-sm">
              <card.icon className="size-5 text-primary" />
              <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">{card.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
            </article>
          ))}
        </section>

        <LegalRequestForm initialType={defaultType} />

        {copyrightDocument ? (
          <section className="rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <ScrollText className="size-5 text-primary" />
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{txa('Resmi İnceleme İlkeleri')}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {txa('Form göndermeden önce inceleme standardını özetleyen resmi maddeler.')}
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {copyrightDocument.sections.map((section) => (
                <section key={section.id} className="rounded-[22px] border border-border/70 bg-background/85 px-4 py-4">
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">{section.title}</h3>
                  {section.summary ? (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.summary}</p>
                  ) : null}
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph} className="mt-3 text-sm leading-7 text-muted-foreground">{paragraph}</p>
                  ))}
                  {section.bullets?.length ? (
                    <ul className="mt-4 space-y-2.5">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                          <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PolicyPageShell>
  )
}

export default LegalRequestCenterPage
