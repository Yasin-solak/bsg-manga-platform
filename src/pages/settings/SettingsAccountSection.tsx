import { useState } from 'react'
import { Link } from '@/i18n/router'
import type { CurrentUser } from '@/contexts/AuthContext'
import { useAccountSecurityPanelState } from '@/components/layout/account/useAccountSecurityPanelState'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { PrivacyVisibility } from '@/services/userService'
import { SettingsRow } from './SettingsRow'
import { SettingsSecurityDetails } from './SettingsSecurityDetails'
import { LinkedDiscordAccount } from '@/components/layout/account/LinkedDiscordAccount'
import { CommunityPreference } from '../communityV2/CommunityPreference'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function SettingsAccountSection({ section, user }: { section: 'hesap' | 'gizlilik' | 'guvenlik'; user: CurrentUser }) {
  const scope = section === 'hesap' ? 'account' : section === 'gizlilik' ? 'privacy' : 'security'
  const state = useAccountSecurityPanelState({ open: true, scope })
  const [detail, setDetail] = useState<'sessions' | 'mfa' | 'blocked' | null>(null)
  const unknown = state.loading ? txa('Yükleniyor…') : txa('Yüklenemedi')
  // Account privacy has two options (on a private account only approved followers see the profile);
  // other surfaces keep three options.
  const privacyRows = [
    ['statsVisibility', txa('Okuma istatistiklerim'), txa('Okuma özeti ve sayısal profil bilgileri.')],
    ['activityVisibility', txa('Listelerim ve takip raflarım'), txa('Listelerin, takip ettiğin seriler, ekipler ve son hareketlerin.')],
    ['socialLinksVisibility', txa('Sosyal bağlantılarım'), txa('Profiline eklediğin Discord, Instagram ve X bağlantıları.')],
  ] as const
  return <>
    {section === 'hesap' && <>
      <SettingsRow title={txa('E-posta')} description={state.snapshot ? `${state.snapshot.email} — ${state.snapshot.emailVerifiedAt ? txa('doğrulandı') : txa('doğrulama bekliyor')}` : unknown}><span className="settings-value">{txa('Giriş adresi')}</span></SettingsRow>
      <SettingsRow title={txa('Kullanıcı adı')} description={`@${user.username}`}><Link className="settings-action" to={`/profil/${encodeURIComponent(user.username)}`}>{txa('Profili aç')}</Link></SettingsRow>
      <SettingsRow title={txa('Doğum tarihi')} description={user.birthDate ? new Date(`${user.birthDate.slice(0, 10)}T12:00:00`).toLocaleDateString(intlLocale()) : txa('Kayıtlı doğum tarihi bulunamadı.')}><span className="settings-value">{txa('Kayıtlı bilgi')}</span></SettingsRow>
      <LinkedDiscordAccount />
      {state.loadErrors.snapshot && <button className="settings-action" onClick={() => void state.loadSnapshot()}>{txa('Hesap bilgilerini tekrar yükle')}</button>}
    </>}
    {section === 'gizlilik' && <>
      <CommunityPreference />
      {state.privacyLoading ? <p role="status">{txa('Gizlilik ayarların yükleniyor…')}</p> : state.privacySettings ? <>
        <SettingsRow title={txa('Hesap gizliliği')} description={txa('Gizli hesapta seni takip etmek isteyenler istek gönderir; profilini yalnızca onayladıkların görür.')}>
          <select aria-label={txa('Hesap gizliliği')} disabled={state.privacySaving} value={state.privacySettings.profileVisibility === 'public' ? 'public' : 'private'} onChange={event => state.handlePrivacyChange('profileVisibility', event.target.value as PrivacyVisibility)}>
            <option value="public">{txa('Herkese açık')}</option>
            <option value="private">{txa('Gizli hesap')}</option>
          </select>
        </SettingsRow>
        {state.privacySettings.profileVisibility !== 'public' && (
          <SettingsRow title={txa('Takip istekleri')} description={txa('Gizli hesabına gelen takip isteklerini onayla ya da sil.')}>
            <Link className="settings-action" to={`/profil/${encodeURIComponent(user.username)}?takip-istekleri=1`}>{txa('İstekleri aç')}</Link>
          </SettingsRow>
        )}
        {privacyRows.map(([key, title, description]) => <SettingsRow key={key} title={title} description={description}><select aria-label={title} disabled={state.privacySaving} value={state.privacySettings![key]} onChange={event => state.handlePrivacyChange(key, event.target.value as PrivacyVisibility)}><option value="public">{txa('Herkese açık')}</option><option value="followers">{txa('Takipçiler')}</option><option value="private">{txa('Sadece ben')}</option></select></SettingsRow>)}
        <button className="settings-save" disabled={state.privacySaving} onClick={() => void state.handleSavePrivacySettings()}>{state.privacySaving ? txa('Kaydediliyor…') : txa('Gizlilik ayarlarını kaydet')}</button>
      </> : state.loadErrors.privacy ? <p role="alert">{txa('Gizlilik ayarların yüklenemedi.')} <button className="settings-action" onClick={() => void state.loadPrivacySettings()}>{txa('Tekrar dene')}</button></p> : <p role="status">{txa('Gizlilik ayarların hazırlanıyor…')}</p>}
      <SettingsRow title={txa('Engellenenler')} description={state.blockedUsersLoading ? txa('Yükleniyor…') : state.loadErrors.blocked ? txa('Liste yüklenemedi.') : `${state.blockedUsers.length} hesap`}><button className="settings-action" onClick={() => setDetail('blocked')}>{txa('Yönet')}</button></SettingsRow>
    </>}
    {section === 'guvenlik' && <>
      <SettingsRow title={txa('İki adımlı doğrulama')} description={state.isMfaEnabled ? state.mfaStatusLabel : txa('Şu anda kullanılamıyor. SMS ile doğrulama sunulmuyor.')}>{state.isMfaEnabled && <button className="settings-action" onClick={() => setDetail('mfa')}>{txa('Yönet')}</button>}</SettingsRow>
      <SettingsRow title={txa('Cihazlar ve oturumlar')} description={state.sessionsLoading ? txa('Yükleniyor…') : state.loadErrors.sessions ? txa('Oturum listesi yüklenemedi.') : txa('{v1} aktif oturum · {v2} cihaz/oturum kaydı', { v1: state.sessionRows.filter(row => row.isActive && !row.isRevoked).length, v2: state.sessionRows.length })}><button className="settings-action" onClick={() => setDetail('sessions')}>{txa('Yönet')}</button></SettingsRow>
      <SettingsRow title={txa('Şifre')} description={txa('Giriş e-posta adresine şifre yenileme bağlantısı gönderilir.')}><button className="settings-action" disabled={state.passwordResetLoading || !state.snapshot?.email} onClick={() => void state.handlePasswordReset()}>{state.passwordResetLoading ? txa('Gönderiliyor…') : txa('Yenileme bağlantısı')}</button></SettingsRow>
      {state.loadErrors.snapshot && <button className="settings-action" onClick={() => void state.loadSnapshot()}>{txa('Hesap bilgilerini tekrar yükle')}</button>}
    </>}
    <Dialog open={detail !== null} onOpenChange={open => { if (!open) setDetail(null) }}><DialogContent className="settings-detail sm:max-w-[680px] max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{detail === 'sessions' ? txa('Cihazlar ve oturumlar') : detail === 'mfa' ? txa('İki adımlı doğrulama') : txa('Engellenenler')}</DialogTitle></DialogHeader><SettingsSecurityDetails detail={detail} state={state} /></DialogContent></Dialog>
  </>
}
