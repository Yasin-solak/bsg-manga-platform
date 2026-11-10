import { BookOpen, Check, Coins, LifeBuoy, MessageSquare, ShieldAlert, UserRound, Users } from 'lucide-react'
import { CONTACT_CARDS, HELP_CENTER_TOPICS, localizePolicyContent } from '@/content/policies'
import { CONTACT_PATH, FAQ_PATH, POLICY_HUB_PATH } from '@/lib/policyRoutes'
import { PolicyAsideCard, PolicyLinkList, PolicyPageShell } from '@/components/policies/PolicyPageShell'
import { txa } from '@/i18n/activeLocale'

// Icon identity by topic order; the array wraps if the topic count grows.
const TOPIC_ICONS = [UserRound, Users, BookOpen, Coins, ShieldAlert, MessageSquare]

function HelpCenterPage() {
  return (
    <PolicyPageShell
      eyebrow={txa('Destek')}
      title={txa('Yardım Merkezi')}
      summary={txa('Hesap, topluluk, fansub, telif, mağaza ve coin akışları için temel destek başlıklarını ve doğru politika yönlendirmelerini bu sayfadan takip edin.')}
      icon={<LifeBuoy className="size-5" />}
      meta={[
        { label: txa('Erisim'), value: txa('Misafir ve girişli kullanıcıya açık') },
        { label: txa('Odak'), value: txa('Yardım, yönlendirme ve resmi bağlantılar') },
      ]}
      aside={(
        <div className="space-y-4">
          <PolicyAsideCard title={txa('Destek bağlantıları')} icon={<LifeBuoy />}>
            <PolicyLinkList
              links={[
                { label: txa('SSS'), to: FAQ_PATH },
                { label: txa('İletişim ve Hata Bildir'), to: CONTACT_PATH },
                { label: txa('Kurallar ve Politikalar Merkezi'), to: POLICY_HUB_PATH },
              ]}
            />
          </PolicyAsideCard>
        </div>
      )}
    >
      <div className="space-y-5">
        {localizePolicyContent(HELP_CENTER_TOPICS).map((topic, index) => {
          const TopicIcon = TOPIC_ICONS[index % TOPIC_ICONS.length]
          return (
            <section key={topic.title} className="rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3.5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <TopicIcon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
                    {topic.title}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {topic.description}
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5">
                {topic.points.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground sm:text-[15px]">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                      <Check className="size-3" />
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <PolicyLinkList links={topic.relatedLinks} />
              </div>
            </section>
          )
        })}

        <section className="grid gap-5 lg:grid-cols-2">
          {localizePolicyContent(CONTACT_CARDS).map((card) => (
            <div key={card.title} className="rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-black tracking-tight text-foreground sm:text-xl">
                {card.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {card.description}
              </p>
              <ul className="mt-4 space-y-2.5">
                {card.points.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                      <Check className="size-3" />
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <PolicyLinkList links={card.relatedLinks} />
              </div>
            </div>
          ))}
        </section>
      </div>
    </PolicyPageShell>
  )
}

export default HelpCenterPage
