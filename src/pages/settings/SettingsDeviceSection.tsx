import { useThemeContext } from '@/contexts/ThemeContext'
import { useDesktopAppearance } from '@/contexts/DesktopAppearanceContext'
import { useReaderV2Preferences } from '@/pages/reader/useReaderV2Preferences'
import type { ReaderV2FitMode, ReaderV2ModePreference } from '@/pages/reader/readerV2LayoutEngine'
import { SettingsRow, SettingsSwitch } from './SettingsRow'
import { txa } from '@/i18n/activeLocale'
import { LocaleSwitchLink } from '@/i18n/router'
import { useT } from '@/i18n/LocaleProvider'

export function SettingsDeviceSection({ section }: { section: 'okuma' | 'gorunum' }) {
  const { theme, setTheme } = useThemeContext()
  const appearance = useDesktopAppearance()
  const t = useT()
  const { preferences, updatePreferences } = useReaderV2Preferences()
  if (section === 'gorunum') return <>
    <SettingsRow title={txa('Tema')} description={txa('Bu tarayıcıdaki görünüm tercihin.')}><select aria-label={txa('Tema')} value={theme} onChange={event => setTheme(event.target.value as typeof theme)}><option value="dark">{txa('Koyu')}</option><option value="light">{txa('Açık')}</option><option value="system">{txa('Sistem')}</option></select></SettingsRow>
    <SettingsRow title={txa('Arayüz dili')} description={txa('Sayfanın dilini değiştirir; adres de o dilin adresine geçer.')}><LocaleSwitchLink className="settings-value">{t('locale.switchTo')}</LocaleSwitchLink></SettingsRow>
    <SettingsSwitch title={txa('Hareketi azalt')} description={txa('Masaüstünde arayüz geçişlerini ve çerçeve hareketlerini azaltır.')} checked={appearance.preferences.reduceMotion} onChange={value => appearance.update({ reduceMotion: value })} />
    <SettingsSwitch title={txa('Avatar çerçeve animasyonları')} description={txa('Masaüstünde kapatınca çerçevelerin sabit görünümü kullanılır.')} checked={appearance.preferences.animateFrames} onChange={value => appearance.update({ animateFrames: value })} />
    {appearance.error && <p role="alert" className="settings-error">{txa('Tercihin kaydedilemedi. Tarayıcı depolama iznini kontrol edip tekrar dene.')}</p>}
    <p className="settings-note">{txa('Bu tercihler bu tarayıcıda saklanır. Hareketi azalt açıkken çerçeveler de sabit kalır.')}</p>
  </>
  return <>
    <SettingsRow title={txa('Varsayılan mod')} description={txa('İçeriğe göre otomatik seçim, dikey şerit veya sayfa modu.')}><select aria-label={txa('Varsayılan mod')} value={preferences.modePreference} onChange={event => updatePreferences({ modePreference: event.target.value as ReaderV2ModePreference })}><option value="auto">{txa('Otomatik')}</option><option value="strip">{txa('Dikey şerit')}</option><option value="page">{txa('Sayfa')}</option></select></SettingsRow>
    <SettingsSwitch title={txa('Sayfa aralarını kaldır')} description={txa('Dikey şeritte sayfalar kesintisiz akar.')} checked={preferences.seamless} onChange={value => updatePreferences({ seamless: value })} />
    <SettingsRow title={txa('Sayfayı sığdır')} description={txa('Okuyucunun başlangıçtaki görsel boyutu.')}><select aria-label={txa('Sayfayı sığdır')} value={preferences.fitMode} onChange={event => updatePreferences({ fitMode: event.target.value as ReaderV2FitMode })}><option value="width">{txa('Genişliğe')}</option><option value="height">{txa('Yüksekliğe')}</option><option value="original">{txa('Orijinal')}</option></select></SettingsRow>
    <SettingsRow title={txa('Kaldığın yeri hatırla')} description={txa('Giriş yaptığında okuma ilerlemen hesabına kaydedilir.')}><span className="settings-value">{txa('Otomatik')}</span></SettingsRow>
    <SettingsRow title={txa('Görsel kalitesi')} description={txa('Yayınlanan bölüm görselleri kullanılır. Ayrı kalite seçenekleri bulunmuyor.')}><span className="settings-value">{txa('Orijinal')}</span></SettingsRow>
    <p className="settings-note">{txa('Mod, sayfa aralığı ve sığdırma tercihi bu tarayıcıdaki mevcut okuyucuyla paylaşılır.')}</p>
  </>
}
