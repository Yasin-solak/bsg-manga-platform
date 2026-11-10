import { useEffect } from 'react'
import { useNavigate } from '@/i18n/router'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { clearPendingDiscordLink, readLinkedAccountState, readPendingDiscordLink } from '@/services/linkedAccountService'
import { txa } from '@/i18n/activeLocale'

export function DiscordLinkReturn() {
  const { currentUser, loading } = useAuth()
  const userId = currentUser?.authUserId
  const navigate = useNavigate()
  useEffect(() => {
    if (loading) return
    const pending = readPendingDiscordLink()
    if (!pending) return
    let active = true
    if (!userId) { clearPendingDiscordLink(); toast.error(txa('Discord bağlantısını kontrol etmek için mevcut hesabına tekrar giriş yap.')); return }
    void readLinkedAccountState().then(state => {
      if (!active) return
      clearPendingDiscordLink()
      if (state.userId !== pending.userId) toast.error(txa('Aktif hesap değişmiş. Discord bağlantısı bu hesap için doğrulanmadı.'))
      else if (state.discord) toast.success(txa('Discord hesabın mevcut hesabına bağlandı.'))
      else toast.error(txa('Discord bağlantısı tamamlanmadı veya iptal edildi. Ayarlar’dan tekrar deneyebilirsin.'))
      navigate('/ayarlar?bolum=hesap', { replace: true })
    }).catch(() => {
      if (!active) return
      clearPendingDiscordLink()
      toast.error(txa('Bağlantı sonucu doğrulanamadı. Ayarlar’daki Bağlı hesaplar bölümünden kontrol et.'))
      navigate('/ayarlar?bolum=hesap', { replace: true })
    })
    return () => { active = false }
  }, [userId, loading, navigate])
  return null
}
