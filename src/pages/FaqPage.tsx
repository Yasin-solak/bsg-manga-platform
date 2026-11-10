import { useMemo, useState } from 'react'
import { HelpCircle, LifeBuoy, Search } from 'lucide-react'
import { FAQ_ITEMS, localizePolicyContent } from '@/content/policies'
import { CONTACT_PATH, HELP_CENTER_PATH, POLICY_HUB_PATH } from '@/lib/policyRoutes'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { PolicyAsideCard, PolicyLinkList, PolicyPageShell } from '@/components/policies/PolicyPageShell'
import { txa, intlLocale } from '@/i18n/activeLocale'

function normalizeForSearch(value: string) {
  return value.toLocaleLowerCase(intlLocale())
}

function FaqPage() {
  const [query, setQuery] = useState('')

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeForSearch(query.trim())
    if (!normalizedQuery) return localizePolicyContent(FAQ_ITEMS)
    return localizePolicyContent(FAQ_ITEMS).filter((item) => (
      normalizeForSearch(item.question).includes(normalizedQuery)
      || normalizeForSearch(item.answer).includes(normalizedQuery)
    ))
  }, [query])

  return (
    <PolicyPageShell
      eyebrow={txa('Destek')}
      title={txa('Sık Sorulan Sorular')}
      summary={txa('Topluluk, fansub, mağaza, coin ve yaptırım akışlarında en çok sorulan soruları tek bir yerde toplar.')}
      icon={<HelpCircle className="size-5" />}
      meta={[
        { label: txa('Kapsam'), value: txa('Topluluk, fansub ve mağaza') },
        { label: txa('Format'), value: txa('Kısa ve yönlendirici cevaplar') },
      ]}
      aside={(
        <div className="space-y-4">
          <PolicyAsideCard title={txa('Sonraki adım')} icon={<LifeBuoy />}>
            <PolicyLinkList
              links={[
                { label: txa('Yardım Merkezi'), to: HELP_CENTER_PATH },
                { label: txa('Kurallar ve Politikalar Merkezi'), to: POLICY_HUB_PATH },
                { label: txa('İletişim ve Hata Bildir'), to: CONTACT_PATH },
              ]}
            />
          </PolicyAsideCard>
        </div>
      )}
    >
      <section className="rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={txa('Soru veya cevaplarda ara...')}
            className="h-11 w-full rounded-2xl border border-border/70 bg-background/85 pl-10 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          {txa('{v1} soru', { v1: filteredItems.length })}{query.trim() ? txa(' — "{v1}" icin', { v1: query.trim() }) : ''}
        </p>

        {filteredItems.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border/70 bg-background/60 px-5 py-10 text-center">
            <p className="text-sm font-semibold text-foreground">{txa('Bu aramayla eşleşen soru bulunamadı.')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{txa('Farklı bir ifade dene ya da Yardım Merkezi\'ne göz at.')}</p>
          </div>
        ) : (
          <Accordion type="single" collapsible className="mt-4 space-y-2.5">
            {filteredItems.map((item) => (
              <AccordionItem
                key={item.question}
                value={item.question}
                className="rounded-2xl border border-border/70 bg-background/85 px-4 transition-colors data-[state=open]:border-primary/30 data-[state=open]:bg-primary/[0.04]"
              >
                <AccordionTrigger className="gap-3 text-left text-[15px] font-semibold text-foreground hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="border-t border-border/50 pb-4 pt-3 text-sm leading-7 text-muted-foreground sm:text-[15px]">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>
    </PolicyPageShell>
  )
}

export default FaqPage
