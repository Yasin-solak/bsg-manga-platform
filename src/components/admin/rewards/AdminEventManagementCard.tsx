/**
 * AdminEventManagementCard: site-admin seasonal EVENT management (2 layers)
 *
 * Layer 1: event entity (quest_events) list + create/edit
 * (name, theme, banner, structure=independent/chain, date, active).
 * Layer 2: quests of the selected event: add/name/delete, metric+target+reward,
 * chain (unlock) order, per-quest participation stats.
 * Loads its own data (self-contained). Banner: URL in Phase 1; file upload in Phase 2.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarClock, CheckCircle2, Coins, Loader2, Lock, Pencil, Plus, RefreshCw, Save, Sparkles, Trash2, Upload, Users, X } from 'lucide-react'
import {
  deleteAdminEventQuest,
  deleteAdminQuestEvent,
  listAdminEventQuests,
  listAdminQuestEvents,
  upsertAdminEventQuest,
  upsertAdminQuestEvent,
  type AdminEventQuest,
  type AdminQuestEvent,
} from '@/services/rewardService'
import { toast } from '@/services/toastService'
import { createScopedLogger } from '@/services/logger'
import { confirmDialog } from '@/services/confirmService'
import { uploadEventBanner } from '@/services/storageService'
import { EVENT_THEMES, EVENT_THEME_KEYS } from '@/lib/eventThemes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

const logger = createScopedLogger('AdminEventManagementCard')

function themeGradient(key: string) {
  return (EVENT_THEMES[key] || EVENT_THEMES.ozel).gradient
}

const METRIC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'chapters_read', get label() { return txa('Bolum okuma') } },
  { value: 'rating_count', get label() { return txa('Manga puanlama') } },
  { value: 'manga_comment_count', get label() { return txa('Manga yorumu') } },
  { value: 'total_comment_count', get label() { return txa('Toplam yorum') } },
]
function metricLabel(key: string) {
  return METRIC_OPTIONS.find((m) => m.value === key)?.label || key
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(intlLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function num(v: number) {
  return Number(v || 0).toLocaleString(intlLocale())
}

interface EventFormState {
  id: string | null
  title: string
  description: string
  themeKey: string
  bannerUrl: string
  structure: 'independent' | 'chain'
  startsAt: string
  endsAt: string
  isActive: boolean
  sortOrder: number
}
const EMPTY_EVENT: EventFormState = {
  id: null, title: '', description: '', themeKey: 'yaz', bannerUrl: '',
  structure: 'independent', startsAt: '', endsAt: '', isActive: true, sortOrder: 0,
}

export function AdminEventManagementCard() {
  const [events, setEvents] = useState<AdminQuestEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [eventForm, setEventForm] = useState<EventFormState | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEvents(await listAdminQuestEvents())
    } catch (err) {
      logger.error({ event: 'load-quest-events', message: 'Etkinlikler yüklenemedi', error: err })
      toast.error(err instanceof Error ? txa(err.message) : txa('Etkinlikler yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedEventId) || null, [events, selectedEventId])

  const patch = (p: Partial<EventFormState>) => setEventForm((prev) => (prev ? { ...prev, ...p } : prev))

  const handleSaveEvent = async () => {
    if (!eventForm) return
    if (!eventForm.title.trim()) { toast.error(txa('Etkinlik başlığı zorunlu.')); return }
    setSaving(true)
    try {
      await upsertAdminQuestEvent({
        id: eventForm.id,
        title: eventForm.title.trim(),
        description: eventForm.description,
        themeKey: eventForm.themeKey,
        bannerUrl: eventForm.bannerUrl.trim() || null,
        structure: eventForm.structure,
        startsAt: fromLocalInput(eventForm.startsAt),
        endsAt: fromLocalInput(eventForm.endsAt),
        isActive: eventForm.isActive,
        sortOrder: eventForm.sortOrder,
      })
      toast.success(eventForm.id ? txa('Etkinlik güncellendi.') : txa('Etkinlik oluşturuldu.'))
      setEventForm(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? txa(err.message) : txa('Kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEvent = async (ev: AdminQuestEvent) => {
    const ok = await confirmDialog({
      title: txa('Etkinligi sil'),
      message: txa('"{v1}" ve tum gorevleri silinecek. Emin misiniz?', { v1: ev.title }),
      confirmText: txa('Sil'), variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteAdminQuestEvent(ev.id)
      toast.success(txa('Etkinlik silindi.'))
      if (selectedEventId === ev.id) setSelectedEventId(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? txa(err.message) : txa('Silinemedi.'))
    }
  }

  const startEditEvent = (ev: AdminQuestEvent) => setEventForm({
    id: ev.id, title: ev.title, description: ev.description, themeKey: ev.themeKey,
    bannerUrl: ev.bannerUrl || '', structure: ev.structure,
    startsAt: toLocalInput(ev.startsAt), endsAt: toLocalInput(ev.endsAt),
    isActive: ev.isActive, sortOrder: ev.sortOrder,
  })

  // ---- Layer 2: quests of the selected event ----
  if (selectedEvent) {
    return (
      <EventQuestManager
        event={selectedEvent}
        onBack={() => setSelectedEventId(null)}
        onChanged={() => void load()}
      />
    )
  }

  // ---- Katman 1: etkinlik listesi ----
  const liveCount = events.filter((e) => e.isLive).length
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 via-orange-500 to-amber-500 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold">{txa('Etkinlik yönetimi')}</h3>
            <p className="text-xs text-muted-foreground">{txa('Önce etkinliği oluştur (ad, tema, tarih), sonra görevlerini seç.')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> {txa('Yenile')}
          </Button>
          <Button size="sm" onClick={() => setEventForm({ ...EMPTY_EVENT })} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />{txa('Yeni Etkinlik')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatBox icon={CalendarClock} label={txa('Toplam etkinlik')} value={events.length} />
        <StatBox icon={CheckCircle2} label={txa('Şu an canlı')} value={liveCount} accent="text-emerald-600 dark:text-emerald-400" />
        <StatBox icon={Users} label={txa('Katılımcı (toplam)')} value={events.reduce((s, e) => s + e.participantCount, 0)} />
      </div>

      {eventForm ? (
        <EventForm form={eventForm} saving={saving} onPatch={patch} onCancel={() => setEventForm(null)} onSave={() => void handleSaveEvent()} />
      ) : null}

      {loading && events.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span className="ml-2 text-sm">{txa('Yükleniyor…')}</span></div>
      ) : events.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{txa('Henüz etkinlik yok. "Yeni etkinlik" ile başla.')}</p>
      ) : (
        <div className="space-y-2.5">
          {events.map((ev) => (
            <div key={ev.id} className={cn('overflow-hidden rounded-xl border border-border/60')}>
              <div className={cn('flex items-center gap-3 px-3.5 py-2.5 text-white bg-gradient-to-r', themeGradient(ev.themeKey))}>
                <Sparkles className="h-4 w-4 shrink-0 opacity-90" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold drop-shadow-sm">{ev.title}</p>
                  <p className="truncate text-[11px] text-white/85">{formatDate(ev.startsAt)} → {formatDate(ev.endsAt)}</p>
                </div>
                {ev.isLive ? <Badge className="border-0 bg-white/25 text-[10px] text-white">{txa('Canli')}</Badge>
                  : ev.isActive ? <Badge className="border-0 bg-white/15 text-[10px] text-white">{txa('Zamanlanmis')}</Badge>
                  : <Badge className="border-0 bg-black/20 text-[10px] text-white/80">{txa('Pasif')}</Badge>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span><b className="text-foreground">{ev.questCount}</b> {txa('görev')}</span>
                  <span><b className="text-foreground">{num(ev.participantCount)}</b> {txa('katılımcı')}</span>
                  <span><b className="text-amber-600 dark:text-amber-400">{num(ev.coinCredited)}</b> {txa('coin dagitildi')}</span>
                  <span className="capitalize">{ev.structure === 'chain' ? txa('zincir') : txa('bagimsiz')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setSelectedEventId(ev.id)} className="gap-1.5">{txa('Görevleri yönet')}</Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => startEditEvent(ev)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => void handleDeleteEvent(ev)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function EventForm({ form, saving, onPatch, onCancel, onSave }: {
  form: EventFormState
  saving: boolean
  onPatch: (p: Partial<EventFormState>) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold">{form.id ? txa('Etkinliği düzenle') : txa('Yeni etkinlik')}</p>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}><X className="h-4 w-4" /></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={txa('Etkinlik adı')} className="sm:col-span-2">
          <Input value={form.title} onChange={(e) => onPatch({ title: e.target.value })} placeholder={txa('Yaz Okuma Festivali')} />
        </Field>
        <Field label={txa('Açıklama')} className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => onPatch({ description: e.target.value })} rows={2} placeholder={txa('Yaz boyunca oku, puanla, paylas...')} />
        </Field>
        <Field label={txa('Tema')} className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {EVENT_THEME_KEYS.map((k) => {
              const t = EVENT_THEMES[k]
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => onPatch({ themeKey: k })}
                  className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all', form.themeKey === k ? 'border-primary ring-2 ring-primary/30' : 'border-border/60 hover:border-border')}
                >
                  <span className={cn('h-4 w-4 rounded-full bg-gradient-to-br', t.gradient)} /> {t.label}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label={txa('Banner gorsel')} className="sm:col-span-2">
          <BannerUpload value={form.bannerUrl} onChange={(url) => onPatch({ bannerUrl: url })} />
        </Field>
        <Field label={txa('Yapi')}>
          <select value={form.structure} onChange={(e) => onPatch({ structure: e.target.value as 'independent' | 'chain' })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="independent">{txa('Bağımsız görevler')}</option>
            <option value="chain">{txa('Kademeli zincir (unlock)')}</option>
          </select>
        </Field>
        <Field label={txa('Sıra')}>
          <Input type="number" value={form.sortOrder} onChange={(e) => onPatch({ sortOrder: Number(e.target.value) || 0 })} />
        </Field>
        <Field label={txa('Başlangıç')}><Input type="datetime-local" value={form.startsAt} onChange={(e) => onPatch({ startsAt: e.target.value })} /></Field>
        <Field label={txa('Bitiş')}><Input type="datetime-local" value={form.endsAt} onChange={(e) => onPatch({ endsAt: e.target.value })} /></Field>
        <div className="flex items-center gap-2 pt-2 sm:col-span-2">
          <Switch checked={form.isActive} onCheckedChange={(v) => onPatch({ isActive: v })} />
          <Label className="text-sm">{txa('Aktif')}</Label>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>{txa('Iptal')}</Button>
        <Button size="sm" onClick={onSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{txa('Kaydet')}
        </Button>
      </div>
    </div>
  )
}

interface QuestFormState {
  id: string | null
  title: string
  description: string
  metricKey: string
  targetValue: number
  coinReward: number
  sortOrder: number
  unlockRequiresQuestId: string | null
  isActive: boolean
}
const EMPTY_QUEST: QuestFormState = {
  id: null, title: '', description: '', metricKey: 'chapters_read', targetValue: 10,
  coinReward: 100, sortOrder: 0, unlockRequiresQuestId: null, isActive: true,
}

function EventQuestManager({ event, onBack, onChanged }: { event: AdminQuestEvent; onBack: () => void; onChanged: () => void }) {
  const [quests, setQuests] = useState<AdminEventQuest[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<QuestFormState | null>(null)
  const isChain = event.structure === 'chain'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setQuests(await listAdminEventQuests(event.id))
    } catch (err) {
      logger.error({ event: 'load-event-quests', message: 'Etkinlik görevleri yüklenemedi', error: err })
      toast.error(err instanceof Error ? txa(err.message) : txa('Görevler yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [event.id])

  useEffect(() => { void load() }, [load])

  const patch = (p: Partial<QuestFormState>) => setForm((prev) => (prev ? { ...prev, ...p } : prev))

  const handleSave = async () => {
    if (!form) return
    if (!form.title.trim()) { toast.error(txa('Görev başlığı zorunlu.')); return }
    setSaving(true)
    try {
      await upsertAdminEventQuest({
        eventId: event.id,
        id: form.id,
        title: form.title.trim(),
        description: form.description,
        metricKey: form.metricKey,
        targetValue: form.targetValue,
        coinReward: form.coinReward,
        sortOrder: form.sortOrder,
        unlockRequiresQuestId: isChain ? form.unlockRequiresQuestId : null,
        isActive: form.isActive,
      })
      toast.success(form.id ? txa('Görev güncellendi.') : txa('Görev eklendi.'))
      setForm(null)
      await load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? txa(err.message) : txa('Kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (q: AdminEventQuest) => {
    const ok = await confirmDialog({ title: txa('Görevi sil'), message: txa('"{v1}" silinecek.', { v1: q.title }), confirmText: txa('Sil'), variant: 'danger' })
    if (!ok) return
    try {
      await deleteAdminEventQuest(q.id)
      toast.success(txa('Görev silindi.'))
      await load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? txa(err.message) : txa('Silinemedi.'))
    }
  }

  const startEdit = (q: AdminEventQuest) => setForm({
    id: q.id, title: q.title, description: q.description, metricKey: q.metricKey,
    targetValue: q.targetValue, coinReward: q.coinReward, sortOrder: q.sortOrder,
    unlockRequiresQuestId: q.unlockRequiresQuestId, isActive: q.isActive,
  })
  const unlockOptions = quests.filter((q) => q.id !== form?.id)

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-white bg-gradient-to-br', themeGradient(event.themeKey))}><Sparkles className="h-5 w-5" /></span>
          <div>
            <h3 className="text-base font-bold">{txa('{v1} — Görevler', { v1: event.title })}</h3>
            <p className="text-xs text-muted-foreground">{isChain ? txa('Kademeli zincir: sıra + kilit açma') : txa('Bağımsız görevler')} · {formatDate(event.startsAt)} → {formatDate(event.endsAt)}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setForm({ ...EMPTY_QUEST, sortOrder: quests.length * 10 })} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />{txa('Gorev Ekle')}
        </Button>
      </div>

      {form ? (
        <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">{form.id ? txa('Görevi düzenle') : txa('Yeni görev')}</p>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setForm(null)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={txa('Görev adı')} className="sm:col-span-2"><Input value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder={txa('Festival açılışı')} /></Field>
            <Field label={txa('Açıklama')} className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => patch({ description: e.target.value })} rows={2} placeholder={txa('Festival boyunca 10 bolum oku.')} /></Field>
            <Field label={txa('Metrik')}>
              <select value={form.metricKey} onChange={(e) => patch({ metricKey: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {METRIC_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label={txa('Hedef değer')}><Input type="number" min={1} value={form.targetValue} onChange={(e) => patch({ targetValue: Number(e.target.value) || 1 })} /></Field>
            <Field label={txa('Coin ödülü')}><Input type="number" min={0} value={form.coinReward} onChange={(e) => patch({ coinReward: Number(e.target.value) || 0 })} /></Field>
            <Field label={txa('Sıra')}><Input type="number" value={form.sortOrder} onChange={(e) => patch({ sortOrder: Number(e.target.value) || 0 })} /></Field>
            {isChain ? (
              <Field label={txa('Önce tamamlanması gereken görev')} className="sm:col-span-2">
                <select value={form.unlockRequiresQuestId || ''} onChange={(e) => patch({ unlockRequiresQuestId: e.target.value || null })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">{txa('— Yok (ilk halka) —')}</option>
                  {unlockOptions.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
                </select>
              </Field>
            ) : null}
            <div className="flex items-center gap-2 pt-2"><Switch checked={form.isActive} onCheckedChange={(v) => patch({ isActive: v })} /><Label className="text-sm">{txa('Aktif')}</Label></div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setForm(null)}>{txa('Iptal')}</Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{txa('Kaydet')}</Button>
          </div>
        </div>
      ) : null}

      {loading && quests.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span className="ml-2 text-sm">{txa('Yükleniyor…')}</span></div>
      ) : quests.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{txa('Bu etkinlikte henüz görev yok. "Görev ekle" ile başla.')}</p>
      ) : (
        <div className="space-y-2">
          {quests.map((q) => {
            const unlockTitle = q.unlockRequiresQuestId ? quests.find((x) => x.id === q.unlockRequiresQuestId)?.title : null
            return (
              <div key={q.id} className="rounded-xl border border-border/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-foreground">{q.title}</p>
                      {!q.isActive ? <Badge variant="secondary" className="text-[10px] opacity-70">{txa('Pasif')}</Badge> : null}
                      {isChain && unlockTitle ? <Badge variant="secondary" className="gap-1 text-[10px]"><Lock className="h-2.5 w-2.5" /> {unlockTitle}</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{txa('{v1} · hedef {v2} ·', { v1: metricLabel(q.metricKey), v2: q.targetValue })} <span className="text-amber-600 dark:text-amber-400">{txa('+{v1} coin', { v1: q.coinReward })}</span></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => startEdit(q)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => void handleDelete(q)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  <MiniStat label={txa('Katılımcı')} value={q.participantCount} />
                  <MiniStat label={txa('Tamamlayan')} value={q.completedCount} />
                  <MiniStat label={txa('Ödül alan')} value={q.claimedCount} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function BannerUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadEventBanner(file)
      onChange(url)
      toast.success(txa('Banner yuklendi.'))
    } catch (err) {
      toast.error(err instanceof Error ? txa(err.message) : txa('Yükleme başarısız.'))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }
  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative h-24 w-full overflow-hidden rounded-lg border border-border/60">
          <img src={value} alt="banner" className="h-full w-full object-cover" />
          <Button type="button" variant="secondary" size="icon" className="absolute right-1.5 top-1.5 h-6 w-6" onClick={() => onChange('')}><X className="h-3.5 w-3.5" /></Button>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <label className={cn('inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent', uploading && 'pointer-events-none opacity-60')}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{txa('Gorsel yukle')}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={txa('veya URL yapistir')} className="flex-1" />
      </div>
    </div>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function StatBox({ icon: Icon, label, value, accent }: { icon: typeof Coins; label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <p className={cn('mt-0.5 text-lg font-bold', accent)}>{num(value)}</p>
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums', accent)}>{num(value)}</p>
    </div>
  )
}
