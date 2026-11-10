import { useCallback, useEffect, useState } from 'react'
import { DiscordLogo } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { beginDiscordLink, readLinkedAccountState, type LinkedAccountState } from '@/services/linkedAccountService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { txa } from '@/i18n/activeLocale'

export function LinkedDiscordAccount() {
  const { currentUser } = useAuth()
  const [state, setState] = useState<LinkedAccountState | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setState(null)
    void readLinkedAccountState().then(value => { if (active) setState(value) })
      .catch(reason => { if (active) setError(toUserFacingErrorMessage(reason, txa('Hesap bağlantıları yüklenemedi.'))) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [currentUser?.authUserId, revision])
  const link = useCallback(async () => {
    if (!currentUser || busy) return
    setBusy(true); setError('')
    try { await beginDiscordLink(currentUser.authUserId) }
    catch (reason) { setError(toUserFacingErrorMessage(reason, txa('Discord bağlanamadı.'))); setBusy(false) }
  }, [currentUser, busy])
  return <LinkedDiscordAccountView state={state} loading={loading} busy={busy} error={error} disabled={!currentUser} onLink={() => void link()} onRetry={() => setRevision(value => value + 1)} />
}

export function LinkedDiscordAccountView({ state, loading, busy, error, disabled, onLink, onRetry }: {
  state: LinkedAccountState | null; loading: boolean; busy: boolean; error: string; disabled: boolean; onLink: () => void; onRetry: () => void;
}) {
  return <section aria-label={txa('Bağlı hesaplar')} className="space-y-3 rounded-xl border border-border p-4">
    <div><h3 className="text-sm font-semibold">{txa('Bağlı hesaplar')}</h3><p className="mt-1 text-xs text-muted-foreground">{txa('Discord’u mevcut hesabına bağla; kullanıcı adın, coinlerin, Premium’un ve okuma geçmişin bu hesapta kalır.')}</p></div>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><DiscordLogo size={24} weight="fill" aria-hidden="true" /><div><p className="text-sm font-medium">{txa('Discord')}</p><p className="break-words text-xs text-muted-foreground">{loading ? txa('Kontrol ediliyor…') : state?.discord ? txa('{v1} · Bağlı', { v1: state.discord.name }) : state ? txa('Henüz bağlanmadı') : txa('Durum yüklenemedi')}</p></div></div>
      {state?.discord ? <span className="text-xs font-medium text-primary">{txa('Bağlı')}</span> : <Button variant="outline" size="sm" disabled={loading || busy || !state || disabled} onClick={onLink}>{busy ? txa('Discord’a yönlendiriliyor…') : txa('Discord hesabını bağla')}</Button>}
    </div>
    {!state?.discord && <p className="text-xs text-muted-foreground">{txa('Discord’da onay vermen gerekir. Başka bir BSG hesabına bağlı Discord hesabı buraya taşınmaz.')}</p>}
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>{!busy && <Button size="sm" variant="outline" onClick={onRetry}>{txa('Tekrar kontrol et')}</Button>}</div>}
  </section>
}
