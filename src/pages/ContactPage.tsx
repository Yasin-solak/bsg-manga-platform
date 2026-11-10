import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { CONTACT_CARDS, localizePolicyContent } from '@/content/policies'
import { FAQ_PATH, HELP_CENTER_PATH, POLICY_HUB_PATH } from '@/lib/policyRoutes'
import { PolicyAsideCard, PolicyLinkList, PolicyPageShell } from '@/components/policies/PolicyPageShell'
import { getSiteSettingsPublicContactSnapshot } from '@/services/siteSettingsPublicSnapshot'
import { txa } from '@/i18n/activeLocale'

function hasRealDiscordInvite(url: string) {
  const normalized = url.trim().toLowerCase()
  return normalized.length > 0 && !normalized.includes('discord.gg/example')
}

function ContactPage() {
  const [contactEmail, setContactEmail] = useState<string | null>(null)
  const [discordInviteUrl, setDiscordInviteUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    getSiteSettingsPublicContactSnapshot()
      .then(({ data }) => {
        if (cancelled) return
        const nextContactEmail = typeof data?.contact_email === 'string' ? data.contact_email.trim() : ''
        const nextDiscordInviteUrl = typeof data?.discord_invite_url === 'string' ? data.discord_invite_url.trim() : ''
        setContactEmail(nextContactEmail || null)
        setDiscordInviteUrl(hasRealDiscordInvite(nextDiscordInviteUrl) ? nextDiscordInviteUrl : null)
      })
      .catch(() => {
        if (cancelled) return
        setContactEmail(null)
        setDiscordInviteUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const contactLinks = useMemo(() => {
    const links = []

    if (contactEmail) {
      links.push({ label: `E-posta: ${contactEmail}`, to: `mailto:${contactEmail}` })
    }

    if (discordInviteUrl) {
      links.push({ label: txa('Discord topluluk bağlantısı'), to: discordInviteUrl })
    }

    if (links.length === 0) {
      links.push({ label: txa('Yardım Merkezi'), to: HELP_CENTER_PATH })
    }

    return links
  }, [contactEmail, discordInviteUrl])

  return (
    <PolicyPageShell
      eyebrow={txa('Destek')}
      title={txa('İletişim ve Hata Bildir')}
      summary={txa('Destek, hata bildirimi, telif talebi, yaptırım itirazı ve operasyonel sorunlar için kullanılacak resmi iletişim kanallarını bu sayfada topluyoruz.')}
      meta={[
        { label: txa('Erisim'), value: txa('Tüm kullanıcılara açık') },
        { label: txa('Amaç'), value: txa('Destek, telif, moderasyon ve işlem itirazı') },
      ]}
      aside={(
        <div className="space-y-4">
          <PolicyAsideCard title={txa('İletişim kanalları')}>
            <div className="space-y-2">
              {contactLinks.map((link) => (
                link.to.startsWith('mailto:') || link.to.startsWith('http') ? (
                  <a
                    key={link.to}
                    href={link.to}
                    target={link.to.startsWith('http') ? '_blank' : undefined}
                    rel={link.to.startsWith('http') ? 'noreferrer' : undefined}
                    className="block rounded-2xl border border-border/70 bg-background/85 px-3.5 py-3 text-sm text-foreground transition-colors hover:border-primary/25 hover:text-primary"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="block rounded-2xl border border-border/70 bg-background/85 px-3.5 py-3 text-sm text-foreground transition-colors hover:border-primary/25 hover:text-primary"
                  >
                    {link.label}
                  </Link>
                )
              ))}
            </div>
          </PolicyAsideCard>
          <PolicyAsideCard title={txa('İlgili merkezler')}>
            <PolicyLinkList
              links={[
                { label: txa('Yardım Merkezi'), to: HELP_CENTER_PATH },
                { label: txa('SSS'), to: FAQ_PATH },
                { label: txa('Kurallar ve Politikalar Merkezi'), to: POLICY_HUB_PATH },
              ]}
            />
          </PolicyAsideCard>
        </div>
      )}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {localizePolicyContent(CONTACT_CARDS).map((card) => (
          <section key={card.title} className="rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {card.title}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground sm:text-[15px]">
              {card.description}
            </p>
            <ul className="mt-4 space-y-2">
              {card.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <PolicyLinkList links={card.relatedLinks} />
            </div>
          </section>
        ))}
      </div>
    </PolicyPageShell>
  )
}

export default ContactPage
