import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { uploadAnnouncementImage } from '@/services/announcementV2/imageUpload'
import type { AnnouncementBlock } from '@/services/announcementV2'
import { txa } from '@/i18n/activeLocale'

export function AnnouncementImageInput({ block, announcementId, onChange, onBusy }: {
  block: Extract<AnnouncementBlock, { type: 'image' }>; announcementId: string
  onChange: (block: Extract<AnnouncementBlock, { type: 'image' }>) => void; onBusy: (busy: boolean) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  async function upload(file: File | undefined) {
    if (!file || busy) return
    setBusy(true); onBusy(true); setProgress(0); setError('')
    try {
      const url = await uploadAnnouncementImage(file, announcementId, setProgress)
      onChange({ ...block, url })
    } catch (e) { setError(e instanceof Error ? txa(e.message) : txa('Görsel yüklenemedi.')) }
    finally { setBusy(false); onBusy(false); if (input.current) input.current.value = '' }
  }
  return <div className="space-y-3">
    <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label={txa('Duyuru görsel dosyası')} accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={e => void upload(e.target.files?.[0])} />
    <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="size-4" />{busy ? txa('Yükleniyor %{v1}', { v1: progress }) : txa('Bilgisayardan görsel yükle')}</Button>
    {busy && <progress aria-label={txa('Görsel yükleme durumu')} className="block h-2 w-full" value={progress} max={100} />}
    <p className="text-xs text-muted-foreground">{txa('JPG, PNG, WebP veya GIF · En fazla 10 MB. Görsel Cloudflare’da saklanır; bağlantısına sahip olanlar erişebilir.')}</p>
    <label className="block space-y-1 text-xs">{txa('Görsel bağlantısı')}<Input value={block.url} disabled={busy} onChange={e => onChange({ ...block, url: e.target.value })} placeholder="https://…" maxLength={2048} /></label>
    <label className="block space-y-1 text-xs">{txa('Görsel açıklaması')}<Input value={block.alt} disabled={busy} onChange={e => onChange({ ...block, alt: e.target.value })} placeholder={txa('Görseli göremeyenler için kısa açıklama')} maxLength={200} /></label>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}
