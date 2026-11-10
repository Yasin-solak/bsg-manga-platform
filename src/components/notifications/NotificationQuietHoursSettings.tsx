import { useEffect, useId, useRef, useState } from 'react'
import { Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getNotificationQuietHours,
  setNotificationQuietHours,
  type NotificationQuietHours,
} from '@/services/notificationQuietHours'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

const PRESETS: Array<{ value: string; label: string; hours: NotificationQuietHours }> = [
  { value: 'off', get label() { return txa('Kapalı') }, hours: { enabled: false, start: '22:00', end: '07:00' } },
  { value: '22:00-07:00', label: '22.00 – 07.00', hours: { enabled: true, start: '22:00', end: '07:00' } },
  { value: '23:00-08:00', label: '23.00 – 08.00', hours: { enabled: true, start: '23:00', end: '08:00' } },
  { value: '00:00-09:00', label: '00.00 – 09.00', hours: { enabled: true, start: '00:00', end: '09:00' } },
]

export function NotificationQuietHoursSettings() {
  const id = useId()
  const [hours, setHours] = useState<NotificationQuietHours | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<'load' | 'save' | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const alive = useRef(true)
  const busy = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    let current = true
    setLoading(true)
    setError(null)
    void getNotificationQuietHours().then((value) => {
      if (current) setHours(value)
    }).catch(() => {
      if (current) setError('load')
    }).finally(() => {
      if (current) setLoading(false)
    })
    return () => { current = false }
  }, [reloadVersion])

  async function change(value: string) {
    const preset = PRESETS.find((option) => option.value === value)
    if (!preset || loading || busy.current) return
    busy.current = true
    setSaving(true)
    setError(null)
    try {
      await setNotificationQuietHours(preset.hours)
      if (!alive.current) return
      setHours(preset.hours)
      toast.success(preset.hours.enabled ? txa('Bu cihaz için sessiz saatler kaydedildi.') : txa('Bu cihazda sessiz saatler kapatıldı.'))
    } catch {
      if (!alive.current) return
      setError('save')
      toast.error(txa('Sessiz saatler kaydedilemedi. Tekrar dene.'))
    } finally {
      busy.current = false
      if (alive.current) setSaving(false)
    }
  }

  const selected = hours?.enabled ? `${hours.start}-${hours.end}` : 'off'
  const customHours = hours?.enabled && !PRESETS.some((preset) => preset.value === selected)

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
      <div className="flex gap-3">
        <Moon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <h3 id={`${id}-title`} className="m-0 text-sm font-bold text-foreground">{txa('Bu cihazda sessiz saatler')}</h3>
          <p id={`${id}-description`} className="m-0 text-xs leading-5 text-muted-foreground">
            {txa('Cihazının yerel saatine göre uygulanır. Bildirimler gelmeye devam eder; destekleyen tarayıcılarda bu saatlerde ses ve titreşim kapatılır.')}
          </p>
        </div>
      </div>

      {loading ? <p role="status" className="m-0 text-xs text-muted-foreground">{txa('Sessiz saatler yükleniyor…')}</p> : error === 'load' ? (
        <div className="space-y-3">
          <p role="alert" className="m-0 text-xs text-destructive">{txa('Bu cihazın sessiz saatleri okunamadı.')}</p>
          <Button type="button" variant="outline" onClick={() => setReloadVersion((previous) => previous + 1)} className="min-h-11 rounded-xl">{txa('Sessiz saatleri tekrar yükle')}</Button>
        </div>
      ) : hours ? (
        <div className="space-y-2">
          <label htmlFor={`${id}-period`} className="block text-xs font-semibold text-muted-foreground">{txa('Saat aralığı')}</label>
          <select id={`${id}-period`} value={selected} disabled={saving} aria-describedby={`${id}-description ${id}-status`}
            onChange={(event) => void change(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60">
            {PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{txa(preset.label)}</option>)}
            {customHours ? <option value={selected}>{hours.start} – {hours.end}</option> : null}
          </select>
          <p id={`${id}-status`} role="status" className="m-0 text-xs leading-5 text-muted-foreground">
            {saving ? txa('Bu cihazda kaydediliyor…') : txa('Seçimin bu tarayıcıya kaydedilir; diğer cihazlarını etkilemez.')}
          </p>
          {error === 'save' ? <p role="alert" className="m-0 text-xs text-destructive">{txa('Değişiklik kaydedilemedi. Önceki ayarın korunuyor.')}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
