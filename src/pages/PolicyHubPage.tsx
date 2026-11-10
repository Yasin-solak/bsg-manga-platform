import { Link } from '@/i18n/router'
import { ArrowUpRight, Coins, LifeBuoy, Scale, Users } from 'lucide-react'
import { POLICY_HUB_CATEGORIES, localizePolicyContent } from '@/content/policies'
import { CONTACT_PATH, FAQ_PATH, HELP_CENTER_PATH } from '@/lib/policyRoutes'
import { PolicyAsideCard, PolicyLinkList, PolicyPageShell } from '@/components/policies/PolicyPageShell'
import { txa } from '@/i18n/activeLocale'

// Visual identity by category order (icon + accent tone). If the category count in the content
// module grows, the array wraps.
const CATEGORY_VISUALS = [
  { icon: Scale, chip: 'bg-sky-500/12 text-sky-400 border-sky-500/25', hover: 'hover:border-sky-500/40' },
  { icon: Users, chip: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/25', hover: 'hover:border-emerald-500/40' },
  { icon: Coins, chip: 'bg-amber-500/12 text-amber-400 border-amber-500/25', hover: 'hover:border-amber-500/40' },
  { icon: LifeBuoy, chip: 'bg-violet-500/12 text-violet-400 border-violet-500/25', hover: 'hover:border-violet-500/40' },
]

function PolicyHubPage() {
  return (
    <PolicyPageShell
      eyebrow={txa('Merkez')}
      title={txa('Kurallar ve Politikalar Merkezi')}
      summary={txa('Platformun yasal metinlerini, topluluk ve fansub kurallarını, mağaza ekonomisi ilkelerini ve destek yönlendirmelerini tek merkezde toplar.')}
      meta={[
        { label: txa('Kullanım'), value: txa('Tüm ziyaretçiler ve kullanıcılar') },
        { label: txa('Güncelleme mantığı'), value: txa('Yeni ürün akışı açıldıkça güncellenir') },
        { label: txa('Dil'), value: txa('Resmi ve operasyonel') },
      ]}
      aside={(
        <div className="space-y-4">
          <PolicyAsideCard title={txa('Hızlı erişim')} icon={<LifeBuoy />}>
            <PolicyLinkList
              links={[
                { label: txa('Yardım Merkezi'), to: HELP_CENTER_PATH },
                { label: txa('SSS'), to: FAQ_PATH },
                { label: txa('İletişim ve Hata Bildir'), to: CONTACT_PATH },
              ]}
            />
          </PolicyAsideCard>
        </div>
      )}
    >
      <div className="space-y-5">
        {localizePolicyContent(POLICY_HUB_CATEGORIES).map((category, index) => {
          const visual = CATEGORY_VISUALS[index % CATEGORY_VISUALS.length]
          const CategoryIcon = visual.icon
          return (
            <section key={category.title} className="rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3.5">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border ${visual.chip}`}>
                  <CategoryIcon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
                    {category.title}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {category.description}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {category.links.map((link) => (
                  <Link
                    key={`${link.to}-${link.label}`}
                    to={link.to}
                    className={`group flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/85 px-4 py-3.5 text-sm font-semibold text-foreground transition-all ${visual.hover} hover:bg-foreground/[0.03]`}
                  >
                    <span>{link.label}</span>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </PolicyPageShell>
  )
}

export default PolicyHubPage
