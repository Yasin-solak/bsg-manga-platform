import { SettingsSupportSection } from './settings/SettingsSupportSection'
import { Link, useSearchParams } from '@/i18n/router'
import { Bell, BookOpen, Lifebuoy, LockKey, Palette, ShieldCheck, User } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import { NotificationSettings } from '@/components/notifications/NotificationSettings'
import { SettingsAccountSection } from './settings/SettingsAccountSection'
import { SettingsDeviceSection } from './settings/SettingsDeviceSection'
import { SettingsRow } from './settings/SettingsRow'
import './settings/settings.css'
import { txa } from '@/i18n/activeLocale'

const sections = [
  { id: 'hesap', get title() { return txa('Hesap') }, icon: User, get description() { return txa('Giriş bilgilerin, profilin ve hesap bilgilerin.') } },
  { id: 'okuma', get title() { return txa('Okuma') }, icon: BookOpen, get description() { return txa('Bu tarayıcıda varsayılan okuyucu davranışı. Okuyucu içinden de değiştirebilirsin.') } },
  { id: 'bildirim', get title() { return txa('Bildirimler') }, icon: Bell, get description() { return txa('Hangi gelişmelerden haberdar olacağını ve sessiz saatlerini seç.') } },
  { id: 'gizlilik', get title() { return txa('Gizlilik') }, icon: LockKey, get description() { return txa('Profilinde kimin neyi görebileceğini belirle.') } },
  { id: 'guvenlik', get title() { return txa('Güvenlik') }, icon: ShieldCheck, get description() { return txa('Oturum güvenliği ve hesap koruma ayarları.') } },
  { id: 'gorunum', get title() { return txa('Görünüm') }, icon: Palette, get description() { return txa('Tema ve bu tarayıcıdaki masaüstü hareket tercihlerin.') } },
  { id: 'destek', get title() { return txa('Destek') }, icon: Lifebuoy, get description() { return txa('Destek ekibine yaz ve taleplerinin yanıtlarını burada takip et.') } },
] as const
export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const { currentUser, loading } = useAuth()
  const selected = sections.find(section => section.id === params.get('bolum')) || sections[0]
  const personal = ['hesap', 'bildirim', 'gizlilik', 'guvenlik'].includes(selected.id)
  return <div className="desktop-settings" data-testid="desktop-settings">
    <nav className="settings-nav" aria-label={txa('Ayarlar bölümleri')}><h1>{txa('Ayarlar')}</h1>{sections.map(section => <button key={section.id} type="button" aria-current={selected.id === section.id ? 'page' : undefined} onClick={() => setParams({ bolum: section.id })}><section.icon size={19} weight="bold" />{section.title}</button>)}</nav>
    <section className="settings-content" aria-labelledby="settings-section-title">
      <h2 id="settings-section-title">{selected.title}</h2><p className="settings-description">{selected.description}</p>
      <div className="settings-rows">
        {personal && loading ? <p role="status">{txa('Hesabın yükleniyor…')}</p> : personal && !currentUser ? <SettingsRow title={txa('Hesabına giriş yap')} description={txa('Kişisel ayarlarını görmek ve düzenlemek için giriş yapmalısın.')}><Link className="settings-action" to="/giris">{txa('Giriş yap')}</Link></SettingsRow> : <>
          {(selected.id === 'hesap' || selected.id === 'gizlilik' || selected.id === 'guvenlik') && currentUser && <SettingsAccountSection key={currentUser.id} section={selected.id} user={currentUser} />}
          {selected.id === 'bildirim' && <NotificationSettings embedded />}
          {(selected.id === 'okuma' || selected.id === 'gorunum') && <SettingsDeviceSection section={selected.id} />}
          {selected.id === 'destek' && <SettingsSupportSection key={currentUser?.id || 'guest'} />}
        </>}
      </div>
    </section>
  </div>
}
