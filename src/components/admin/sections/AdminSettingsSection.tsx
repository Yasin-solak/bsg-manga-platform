import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { BookMarked, Compass, Home, Loader2, RotateCcw, Save, Settings2, Wrench, type LucideIcon } from 'lucide-react'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link, useSearchParams } from '@/i18n/router'
import { cn } from '@/lib/utils'
import type { SiteSettings } from '@/services/adminService'
import { AdminHomepageFeaturedPicker } from './AdminHomepageFeaturedPicker'
import { AdminExploreCurationPanel } from './AdminExploreCurationPanel'
import { AdminMangaListPageConfigPanel } from './AdminMangaListPageConfigPanel'
import { txa } from '@/i18n/activeLocale'

interface AdminSettingsSectionProps {
  settings: SiteSettings
  setSettings: Dispatch<SetStateAction<SiteSettings | null>>
  onSave: () => Promise<boolean>
}

type SettingsTab = 'genel' | 'ana-sayfa' | 'kesfet' | 'listeler'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isSafeUrl = (value: string) => /^https:\/\/\S+$/i.test(value)
const isSafeAsset = (value: string) => isSafeUrl(value) || /^\/[^\s/]\S*$/.test(value)

/** A message specific to the field if saving has an error; otherwise an empty object. */
function validateGeneral(settings: SiteSettings) {
  const errors: { contactEmail?: string; discordInviteUrl?: string; logoUrl?: string } = {}
  if (!EMAIL_PATTERN.test(settings.contactEmail.trim())) errors.contactEmail = txa('Geçerli bir e-posta girin.')
  const discord = settings.discordInviteUrl.trim()
  if (discord && !isSafeUrl(discord)) errors.discordInviteUrl = txa('Bağlantı https:// ile başlamalı.')
  const logo = settings.logoUrl.trim()
  if (logo && !isSafeAsset(logo)) errors.logoUrl = txa('Site yolu ya da https:// adresi girin.')
  return errors
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 px-5 py-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-6">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-[13.5px] font-semibold">{label}</Label>
        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{hint}</p>
      </div>
      <div className="min-w-0">
        {children}
        {error ? <p role="alert" className="mt-1.5 text-[12px] text-destructive">{error}</p> : null}
      </div>
    </div>
  )
}

/**
 * Settings v2. Tabs edit the same record object; the save bar appears only with
 * changes and writes everything at once. The General tab holds only fields the
 * site really uses: the real maintenance mode switch is the
 * system.maintenance flag in Operations.
 */
export function AdminSettingsSection({ settings, setSettings, onSave }: AdminSettingsSectionProps) {
  const [params, setParams] = useSearchParams()
  const requested = params.get('sekme')
  const tab: SettingsTab = requested === 'ana-sayfa' || requested === 'kesfet' || requested === 'listeler' ? requested : 'genel'
  const [baseline, setBaseline] = useState(() => JSON.stringify(settings))
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const dirty = JSON.stringify(settings) !== baseline
  const errors = useMemo(() => validateGeneral(settings), [settings])
  const hasErrors = Object.keys(errors).length > 0

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const selectTab = (next: SettingsTab) => {
    setParams((current) => {
      const out = new URLSearchParams(current)
      if (next === 'genel') out.delete('sekme')
      else out.set('sekme', next)
      return out
    }, { replace: true })
  }

  const set = (patch: Partial<SiteSettings>) => setSettings((prev) => (prev ? { ...prev, ...patch } : prev))

  const save = async () => {
    if (hasErrors) {
      setShowErrors(true)
      selectTab('genel')
      return
    }
    setSaving(true)
    try {
      if (await onSave()) {
        setBaseline(JSON.stringify(settings))
        setShowErrors(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const TABS: Array<[SettingsTab, string, LucideIcon]> = [
    ['genel', txa('Genel'), Settings2],
    ['ana-sayfa', txa('Ana sayfa'), Home],
    ['kesfet', txa('Keşfet'), Compass],
    ['listeler', txa('Listeler'), BookMarked],
  ]

  return (
    <section className="flex flex-col gap-4" data-testid="admin-settings">
      <AdminSectionHeader title={txa('Ayarlar')} description={txa('İletişim bilgileri ve vitrinlerde öne çıkan içerik.')} />

      <div className="inline-flex self-start rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Ayar bölümleri')}>
        {TABS.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => selectTab(id)} data-testid={`admin-settings-tab-${id}`} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors', tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === 'genel' ? (
        <>
          <div className="divide-y divide-border/50 overflow-hidden rounded-[20px] border border-border/70 bg-card/60">
            <Field id="settings-contact-email" label={txa('İletişim e-postası')} hint={txa('İletişim sayfasında gösterilir.')} error={showErrors ? errors.contactEmail : undefined}>
              <Input id="settings-contact-email" type="email" maxLength={200} value={settings.contactEmail} onChange={(event) => set({ contactEmail: event.target.value })} />
            </Field>
            <Field id="settings-discord-url" label={txa('Discord daveti')} hint={txa('Alt bilgide bağlantı olarak çıkar. Boşsa gösterilmez.')} error={showErrors ? errors.discordInviteUrl : undefined}>
              <Input id="settings-discord-url" type="url" maxLength={300} value={settings.discordInviteUrl} onChange={(event) => set({ discordInviteUrl: event.target.value })} placeholder="https://discord.gg/..." />
            </Field>
            <Field id="settings-logo-url" label={txa('Alt bilgi logosu')} hint={txa('Boşsa varsayılan logo kullanılır.')} error={showErrors ? errors.logoUrl : undefined}>
              <div className="flex items-center gap-3">
                <Input id="settings-logo-url" maxLength={500} value={settings.logoUrl} onChange={(event) => set({ logoUrl: event.target.value })} placeholder="/logo.webp" />
                {settings.logoUrl.trim() && !errors.logoUrl ? <img src={settings.logoUrl.trim()} alt="" className="size-9 shrink-0 rounded-lg border border-border object-contain" /> : null}
              </div>
            </Field>
          </div>
          <Link to="/admin/operasyon" className="flex items-center gap-3 rounded-[20px] border border-border/70 bg-card/60 px-5 py-3.5 transition-colors hover:bg-muted/30" data-testid="admin-settings-ops-link">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><Wrench className="size-[18px]" /></span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold">{txa('Bakım modu ve özellik anahtarları')}</span>
              <span className="block text-[12px] text-muted-foreground">{txa('Siteyi bakıma almak ve özellikleri açıp kapatmak Operasyon bölümünde.')}</span>
            </span>
          </Link>
        </>
      ) : null}

      {tab === 'ana-sayfa' ? <AdminHomepageFeaturedPicker settings={settings} setSettings={setSettings} /> : null}
      {tab === 'kesfet' ? <AdminExploreCurationPanel settings={settings} setSettings={setSettings} /> : null}
      {tab === 'listeler' ? <AdminMangaListPageConfigPanel settings={settings} setSettings={setSettings} /> : null}

      {dirty ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur" data-testid="admin-settings-savebar">
          <p className="text-[13px] font-semibold">{txa('Kaydedilmemiş değişiklikler var')}</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => { setSettings(JSON.parse(baseline) as SiteSettings); setShowErrors(false) }}><RotateCcw className="size-3.5" />{txa('Vazgeç')}</Button>
            <Button size="sm" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}{txa('Kaydet')}</Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
