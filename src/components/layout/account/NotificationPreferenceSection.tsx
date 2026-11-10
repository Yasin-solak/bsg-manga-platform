import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type {
  NotificationPreferenceKey,
  NotificationPreferences,
} from '@/services/notificationService'
import { txa } from '@/i18n/activeLocale'

const NOTIFICATION_PREFERENCE_ROWS: Array<{
  key: NotificationPreferenceKey
  label: string
  detail: string
}> = [
  {
    key: 'followEnabled',
    get label() { return txa('Takip bildirimleri') },
    get detail() { return txa('Seni takip eden kullanıcılar için bildirim oluşturur.') },
  },
  {
    key: 'commentEnabled',
    get label() { return txa('Yorum ve yanıt') },
    get detail() { return txa('Yorumlar ve yorum kaynaklı hareketler için bildirim oluşturur.') },
  },
  {
    key: 'mentionEnabled',
    get label() { return txa('Mention bildirimleri') },
    get detail() { return txa('Topluluk gönderisi ve yorum bahsetmeleri için bildirim oluşturur.') },
  },
  {
    key: 'badgeEnabled',
    get label() { return txa('Rozet ve ödül') },
    get detail() { return txa('Rozet kazanımı ve rozet satın alımlarını bildirir.') },
  },
  {
    key: 'levelUpEnabled',
    get label() { return txa('Seviye atlama') },
    get detail() { return txa('Seviye artışlarında bildirim oluşturur.') },
  },
  {
    key: 'systemEnabled',
    get label() { return txa('Sistem bildirimleri') },
    get detail() { return txa('Genel sistem duyuruları ve kritik uygulama mesajlarını gösterir.') },
  },
]

type NotificationPreferenceSectionProps = {
  loading: boolean
  preferences: NotificationPreferences | null
  saving: boolean
  onChange: (key: NotificationPreferenceKey, value: boolean) => void
  onReload: () => void
  onSave: () => void
}

export function NotificationPreferenceSection({
  loading,
  onChange,
  onReload,
  onSave,
  preferences,
  saving,
}: NotificationPreferenceSectionProps) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{txa('Bildirim Tercih Merkezi')}</h3>
        <p className="text-xs text-muted-foreground">
          {txa('Hangi olaylar için bildirim almak istediğini buradan ayarlayabilirsin.')}
        </p>
      </div>
      <Card className="border-border/70 bg-background/70">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {loading
                ? txa('Bildirim tercihleri yükleniyor...')
                : txa('Bu ayarlar yeni oluşacak bildirimlerin hangi kategorilerden geleceğini belirler.')}
            </p>
            <Button variant="outline" size="sm" onClick={onReload} disabled={loading || saving}>
              {loading ? txa('Yukleniyor...') : txa('Tercihleri Yenile')}
            </Button>
          </div>

          {preferences ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {NOTIFICATION_PREFERENCE_ROWS.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor={`notification-pref-${row.key}`} className="text-sm font-semibold text-foreground">
                      {row.label}
                    </Label>
                    <p className="text-[11px] leading-5 text-muted-foreground">{row.detail}</p>
                  </div>
                  <Switch
                    id={`notification-pref-${row.key}`}
                    checked={preferences[row.key]}
                    disabled={saving}
                    onCheckedChange={(checked) => onChange(row.key, checked)}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onSave} disabled={!preferences || loading || saving}>
              {saving ? txa('Kaydediliyor...') : txa('Bildirim Tercihlerini Kaydet')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
