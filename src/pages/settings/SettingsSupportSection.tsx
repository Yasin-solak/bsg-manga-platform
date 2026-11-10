import { useRef, useState } from 'react'
import { Link } from '@/i18n/router'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { SettingsRow } from './SettingsRow'
import { SettingsSupportForm } from './SettingsSupportForm'
import { SettingsDiagnostics } from './SettingsDiagnostics'
import { txa } from '@/i18n/activeLocale'

const cards = [
  { id: 'help', get title() { return txa('Yardım merkezi') }, get description() { return txa('Sık sorulan sorular, hesap ve okuma rehberleri.') } },
  { id: 'support', get title() { return txa('İletişim ve hata bildir') }, get description() { return txa('Destek ekibine yaz, taleplerini ve yanıtlarını takip et.') } },
  { id: 'policies', get title() { return txa('Kurallar ve politikalar') }, get description() { return txa('Topluluk kuralları, gizlilik ve kullanım koşulları.') } },
  { id: 'diagnostics', get title() { return txa('Tanılama verileri') }, get description() { return txa('Hataları çözmemize yardımcı olacak bilgileri ve paylaşım iznini yönet.') } },
] as const

export function SettingsSupportSection() {
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({})
  const [active, setActive] = useState<string | null>(null)
  return <>{cards.map(card => <Dialog key={card.id} open={active === card.id} onOpenChange={open => setActive(open ? card.id : null)}>
    <SettingsRow title={card.title} description={card.description}><DialogTrigger asChild><button ref={node => { triggers.current[card.id] = node }} type="button" className="settings-action" aria-label={txa('{v1} aç', { v1: card.title })}>{txa('Aç')}</button></DialogTrigger></SettingsRow>
    <DialogContent onCloseAutoFocus={event => { event.preventDefault(); triggers.current[card.id]?.focus() }} className="settings-support-dialog sm:max-w-2xl" aria-describedby={`${card.id}-description`}>
      <DialogHeader><DialogTitle>{card.title}</DialogTitle><DialogDescription id={`${card.id}-description`}>{card.description}</DialogDescription></DialogHeader>
      {card.id === 'support' && <SettingsSupportForm />}
      {card.id === 'diagnostics' && <SettingsDiagnostics />}
      {card.id === 'help' && <div className="settings-dialog-stack"><details className="settings-row"><summary>{txa('Bölüm görselleri yüklenmiyor')}</summary><p className="settings-note">{txa('Bağlantını kontrol et ve bölümü yeniden aç. Sorun sürerse İletişim ve hata bildir penceresinde manga ve bölüm bilgisini paylaş.')}</p></details><details className="settings-row"><summary>{txa('Bildirim alamıyorum')}</summary><p className="settings-note">{txa('Ayarlar → Bildirimler bölümündeki tercihlerini ve tarayıcının bildirim iznini kontrol et.')}</p></details><button className="settings-save" onClick={() => setActive('support')}>{txa('Destek ekibine yaz')}</button></div>}
      {card.id === 'policies' && <div className="settings-dialog-stack"><p className="settings-note">{txa('Güncel kurallar ve gizlilik metinlerini aşağıdaki sayfalardan okuyabilirsin.')}</p><Link className="settings-action" to="/kurallar-ve-politikalar">{txa('Kurallar ve politikaları görüntüle')}</Link></div>}
    </DialogContent>
  </Dialog>)}</>
}
