import { useEffect, useState } from 'react'
import { Crown, Ghost, Trophy } from '@phosphor-icons/react'
import { MurekCousin } from '@/components/murek/MurekCousin'
import { MUREK_COUSIN_NAMES } from '@/components/murek/murekCousins'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { getIstilaLeaderboard, getIstilaStatus, ISTILA_KINDS, type IstilaLeader, type IstilaStatus } from '@/services/istilaService'
import { txa } from '@/i18n/activeLocale'

/*
 * Mürek Invasion event panel (on the season page): how to play, today's hunt, a collection of five
 * cousins (caught in color, uncaught as a shadow), your rank and top catchers.
 */
export const ISTILA_SEASON_SLUG = 'murek-istilasi'

export function IstilaPanel() {
  const { currentUser } = useAuth()
  const [status, setStatus] = useState<IstilaStatus | null>(null)
  const [leaders, setLeaders] = useState<IstilaLeader[]>([])

  useEffect(() => {
    let cancelled = false
    void Promise.all([getIstilaStatus().catch(() => null), getIstilaLeaderboard(10).catch(() => [])]).then(([s, l]) => {
      if (cancelled) return
      setStatus(s)
      setLeaders(l)
    })
    return () => { cancelled = true }
  }, [currentUser?.id])

  const caught = new Set(status?.kinds ?? [])
  return (
    <section className='dark grid gap-5 rounded-[20px] border border-border bg-card p-6 text-foreground lg:grid-cols-[minmax(0,1fr)_320px]' data-testid='istila-panel'>
      <div className='flex flex-col gap-4'>
        <div className='flex items-center gap-2'>
          <Ghost weight='fill' size={20} className='text-orange-400' />
          <h2 className='text-[20px] font-black tracking-tight'>{txa('İstila etkinliği: kuzenleri yakala!')}</h2>
        </div>
        <p className='max-w-[620px] text-[13.5px] leading-relaxed text-muted-foreground'>
          {txa('Sitede gezinirken arada bir ekranın kenarından bir Mürek kuzeni çıkar. Kaçmadan tıkla, yakala: her kuzen')} <b className='text-foreground'>{txa('5 Coin')}</b>{txa(', ender Vampir')} <b className='text-foreground'>{txa('25 Coin')}</b>.
          {txa('Günde en fazla')} <b className='text-foreground'>{status?.dailyLimit ?? 10}</b> {txa('yakalama. Beşini de yakalayan')} <b className='text-foreground'>{txa('İstila Avcısı')}</b> {txa('rozetini alır; etkinlik sonunda ilk 3 avcıya')} <b className='text-foreground'>{txa('Tüm Kuzenler Paketi')}</b> {txa('hediye.')}
        </p>
        <div className='grid grid-cols-3 gap-2 sm:grid-cols-5'>
          {ISTILA_KINDS.map((kind) => (
            <div key={kind} className={cn('flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-3', caught.has(kind) ? 'border-orange-400/50 bg-orange-400/10' : 'border-border/70 bg-background/40')}>
              <span className={cn(!caught.has(kind) && 'opacity-30 grayscale')}><MurekCousin kind={kind} size={42} /></span>
              <span className='text-center text-[11.5px] font-bold leading-tight'>{MUREK_COUSIN_NAMES[kind]}</span>
              <span className='text-[10.5px] font-semibold text-muted-foreground'>{caught.has(kind) ? txa('Yakalandı') : txa('Henüz yok')}</span>
            </div>
          ))}
        </div>
        {currentUser ? (
          <div className='flex flex-wrap gap-x-6 gap-y-2 text-[13px]'>
            <span>{txa('Bugün:')} <b>{status?.today ?? 0}/{status?.dailyLimit ?? 10}</b></span>
            <span>{txa('Koleksiyon:')} <b>{caught.size}/5</b></span>
            <span>{txa('Toplam yakalama:')} <b>{status?.total ?? 0}</b></span>
            {status?.rank ? <span>{txa('Sıran:')} <b>#{status.rank}</b></span> : null}
          </div>
        ) : (
          <p className='text-[13px] font-semibold text-muted-foreground'>{txa('Kuzen avına katılmak için giriş yap.')}</p>
        )}
      </div>
      <div className='flex flex-col gap-2 rounded-2xl border border-border/70 bg-background/40 p-4'>
        <span className='flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground'><Trophy size={14} />{txa('En çok yakalayanlar')}</span>
        {leaders.length === 0 ? (
          <span className='py-4 text-[13px] text-muted-foreground'>{txa('İlk avcı sen ol!')}</span>
        ) : (
          <ol className='flex flex-col gap-1.5'>
            {leaders.map((leader) => (
              <li key={`${leader.rank}-${leader.displayName}`} className='flex items-center gap-2.5 text-[13px]'>
                <span className={cn('w-6 text-center font-black tabular-nums', leader.rank <= 3 ? 'text-amber-300' : 'text-muted-foreground')}>{leader.rank <= 3 ? <Crown weight='fill' size={14} className='mx-auto' /> : leader.rank}</span>
                {leader.avatarUrl ? <img src={leader.avatarUrl} alt='' className='size-6 rounded-full object-cover' /> : <span className='size-6 rounded-full bg-muted' />}
                <span className='min-w-0 flex-1 truncate font-semibold'>{leader.displayName}</span>
                <span className='font-black tabular-nums'>{leader.total}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
