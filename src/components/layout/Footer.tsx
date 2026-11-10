import { useEffect, useState, type ReactNode } from 'react'
import { Link, LocaleSwitchLink } from '@/i18n/router'
import { useT } from '@/i18n/LocaleProvider'
import { useCommunityAvailability } from '@/contexts/CommunityAvailabilityContext'
import { Separator } from '@/components/ui/separator'
import { buildExplorePath } from '@/lib/routes'
import {
    COMMUNITY_RULES_PATH,
    CONTACT_PATH,
    COPYRIGHT_POLICY_PATH,
    DMCA_PATH,
    ENFORCEMENT_POLICY_PATH,
    FANSUB_RULES_PATH,
    FAQ_PATH,
    HELP_CENTER_PATH,
    KVKK_PATH,
    POLICY_HUB_PATH,
    PRIVACY_PATH,
    REFUND_POLICY_PATH,
    STORE_RULES_PATH,
    TERMS_PATH,
} from '@/lib/policyRoutes'
import { getSiteSettingsPublicSnapshot } from '@/services/siteSettingsPublicSnapshot'
import { txa } from '@/i18n/activeLocale'

function hasRealDiscordInvite(url: string) {
    return Boolean(url.trim()) && !url.toLowerCase().includes('discord.gg/example')
}

function Footer() {
    const { enabled: communityEnabled } = useCommunityAvailability()
    const t = useT()
    const [logoSrc, setLogoSrc] = useState<string | null>(null)
    const [discordInviteUrl, setDiscordInviteUrl] = useState<string | null>(null)

    useEffect(() => {
        getSiteSettingsPublicSnapshot()
            .then(({ data }) => {
                const nextLogo = typeof data?.logo_url === 'string' ? data.logo_url.trim() : ''
                const nextDiscordInviteUrl = typeof data?.discord_invite_url === 'string' ? data.discord_invite_url.trim() : ''

                setLogoSrc(nextLogo || null)
                setDiscordInviteUrl(hasRealDiscordInvite(nextDiscordInviteUrl) ? nextDiscordInviteUrl : null)
            })
            .catch(() => {
                setLogoSrc(null)
                setDiscordInviteUrl(null)
            })
    }, [])

    return (
        <footer className="border-t border-border bg-card">
            <div className="mx-auto max-w-7xl px-4 py-12 max-lg:py-5 sm:px-6 lg:px-8">
                {/*
                  Bag listesi mobilde GIZLI. Dort sutun ~20 baglanti, telefonda
                  her kaydirmanin sonunda bir ekran boyu yer kapliyordu ve alt
                  sekme cubugunun hemen ustune biniyordu. Ayni baglantilar
                  hamburger menusunde duruyor.
                  Alt satir (telif + "Kurallar ve politikalar") mobilde de
                  KALIR: KVKK/DMCA/Kullanim Sartlari erisilebilirligi yasal bir
                  gereklilik, sadece duzen tercihi degil.
                */}
                <div className="grid grid-cols-2 gap-8 max-lg:hidden md:grid-cols-5">
                    <div className="col-span-2 md:col-span-1">
                        <Link to="/" className="inline-flex items-center gap-3">
                            <BrandMark logoSrc={logoSrc} />
                        </Link>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            {t('footer.tagline')}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            {discordInviteUrl ? (
                                <SocialLink href={discordInviteUrl} label={txa('Discord')}>
                                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                                </SocialLink>
                            ) : null}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold">{t('footer.platform')}</h4>
                        <nav className="mt-3 flex flex-col gap-2">
                            <FooterLink to={buildExplorePath()}>{t('footer.explore')}</FooterLink>
                            <FooterLink to="/fansublar">{t('footer.fansubs')}</FooterLink>
                            {communityEnabled && <FooterLink to="/topluluk">{t('footer.community')}</FooterLink>}
                            <FooterLink to="/magaza">{t('footer.shop')}</FooterLink>
                        </nav>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold">{t('footer.support')}</h4>
                        <nav className="mt-3 flex flex-col gap-2">
                            <FooterLink to={HELP_CENTER_PATH}>{t('footer.helpCenter')}</FooterLink>
                            <FooterLink to={FAQ_PATH}>{t('footer.faq')}</FooterLink>
                            <FooterLink to={CONTACT_PATH}>{t('footer.contact')}</FooterLink>
                            <FooterLink to={POLICY_HUB_PATH}>{t('footer.policyHub')}</FooterLink>
                        </nav>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold">{t('footer.rules')}</h4>
                        <nav className="mt-3 flex flex-col gap-2">
                            <FooterLink to={COMMUNITY_RULES_PATH}>{t('footer.communityRules')}</FooterLink>
                            <FooterLink to={FANSUB_RULES_PATH}>{t('footer.fansubRules')}</FooterLink>
                            <FooterLink to={STORE_RULES_PATH}>{t('footer.storeRules')}</FooterLink>
                            <FooterLink to={ENFORCEMENT_POLICY_PATH}>{t('footer.enforcement')}</FooterLink>
                        </nav>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold">{t('footer.legal')}</h4>
                        <nav className="mt-3 flex flex-col gap-2">
                            <FooterLink to={TERMS_PATH}>{t('footer.terms')}</FooterLink>
                            <FooterLink to={PRIVACY_PATH}>{t('footer.privacy')}</FooterLink>
                            <FooterLink to={KVKK_PATH}>{t('footer.kvkk')}</FooterLink>
                            <FooterLink to={COPYRIGHT_POLICY_PATH}>{t('footer.copyright')}</FooterLink>
                            <FooterLink to={DMCA_PATH}>{t('nav.dmca')}</FooterLink>
                        </nav>
                    </div>
                </div>

                <Separator className="my-8 max-lg:hidden" />

                <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
                    <p className="text-xs text-muted-foreground">
                        {t('footer.rights', { year: new Date().getFullYear() })}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-end">
                        <Link to={POLICY_HUB_PATH} className="transition-colors hover:text-foreground">
                            {t('nav.policies')}
                        </Link>
                        <Link to={REFUND_POLICY_PATH} className="transition-colors hover:text-foreground">
                            {t('footer.digitalDelivery')}
                        </Link>
                        <Link to={DMCA_PATH} className="transition-colors hover:text-foreground">
                            DMCA
                        </Link>
                        <LocaleSwitchLink className="font-semibold transition-colors hover:text-foreground" />
                        <span className="max-lg:hidden">{t('footer.supportHint')}</span>
                    </div>
                </div>
            </div>
        </footer>
    )
}

function BrandMark({ logoSrc }: { logoSrc: string | null }) {
    if (logoSrc) {
        return <img loading="lazy" decoding="async" src={logoSrc} alt={txa('BSG Manga')} className="h-10 w-auto" />
    }

    return (
        <div className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground shadow-sm">
                BM
            </span>
            <span className="text-lg font-black tracking-tight text-foreground">{txa('BSG Manga')}</span>
        </div>
    )
}

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
    return (
        <Link to={to} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {children}
        </Link>
    )
}

function SocialLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={label}
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                {children}
            </svg>
        </a>
    )
}

export default Footer
