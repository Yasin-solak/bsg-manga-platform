import { ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { confirmDialog } from '@/services/confirmService'
import { txa } from '@/i18n/activeLocale'

type FansubDiscordInviteCardProps = {
  discordInviteUrl: string
  fansubName: string
}

function DiscordLogo() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden className='size-7 fill-current'>
      <path d='M20.317 4.369A19.791 19.791 0 0 0 15.885 3c-.191.328-.403.775-.554 1.125a18.27 18.27 0 0 0-6.662 0A12.64 12.64 0 0 0 8.115 3a19.736 19.736 0 0 0-4.433 1.369C.533 9.091-.322 13.696.099 18.243a19.9 19.9 0 0 0 5.437 2.757c.438-.59.828-1.214 1.165-1.87a12.96 12.96 0 0 1-1.837-.89c.154-.113.304-.23.45-.35 3.547 1.662 7.399 1.662 10.904 0 .147.12.297.237.45.35-.59.344-1.206.642-1.84.89.337.656.727 1.28 1.165 1.87a19.88 19.88 0 0 0 5.44-2.757c.494-5.27-.844-9.833-3.782-13.874ZM8.02 15.331c-1.065 0-1.94-.98-1.94-2.184 0-1.203.854-2.184 1.94-2.184 1.086 0 1.961.98 1.94 2.184 0 1.203-.854 2.184-1.94 2.184Zm7.96 0c-1.065 0-1.94-.98-1.94-2.184 0-1.203.854-2.184 1.94-2.184 1.086 0 1.961.98 1.94 2.184 0 1.203-.854 2.184-1.94 2.184Z' />
    </svg>
  )
}

export default function FansubDiscordInviteCard({
  discordInviteUrl,
  fansubName,
}: FansubDiscordInviteCardProps) {
  const handleOpenDiscord = async () => {
    const accepted = await confirmDialog({
      title: txa('Discord bağlantısını aç'),
      message: txa('{v1} için Discord davet bağlantısı yeni sekmede açılacak. Devam etmek istiyor musun?', { v1: fansubName }),
      confirmText: txa('Discord\'u aç'),
      cancelText: txa('Vazgeç'),
      variant: 'info',
    })

    if (!accepted) return
    window.open(discordInviteUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      type='button'
      onClick={() => void handleOpenDiscord()}
      className='block w-full text-left'
      aria-label={txa('{v1} Discord bağlantısını aç', { v1: fansubName })}
    >
      <Card className='group overflow-hidden rounded-[24px] border-border/80 bg-background/95 p-4 shadow-lg transition-colors hover:border-primary/35'>
        <div className='flex items-center gap-3'>
          <div className='inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#5865F2]/12 text-[#5865F2] dark:bg-[#5865F2]/18'>
            <DiscordLogo />
          </div>
          <div className='min-w-0 flex-1'>
            <h3 className='text-sm font-semibold text-foreground transition-colors group-hover:text-primary'>
              {txa('Discord')}
            </h3>
            <p className='text-xs text-muted-foreground'>
              {txa('Sunucuya katıl')}
            </p>
          </div>
          <ArrowUpRight className='size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary' />
        </div>
      </Card>
    </button>
  )
}
