import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { PrivacyVisibility, UserPrivacySettings } from '@/services/userService'
import { USER_PRIVACY_SURFACES } from '@/services/userService/privacyPresentation'
import { Globe2, Lock, Shield, UsersRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { txa } from '@/i18n/activeLocale'

const PROFILE_VISIBILITY_OPTIONS: Array<{ icon: ReactNode; label: string; value: PrivacyVisibility }> = [
  { value: 'public', get label() { return txa('Herkese Açık') }, icon: <Globe2 className="size-3.5" /> },
  { value: 'followers', get label() { return txa('Takipçiler') }, icon: <UsersRound className="size-3.5" /> },
  { value: 'private', get label() { return txa('Sadece Ben') }, icon: <Lock className="size-3.5" /> },
]

// Account visibility has two options: on a private account only approved followers see the profile
// (the server converts the old "followers" value to private).
const ACCOUNT_VISIBILITY_OPTIONS: Array<{ icon: ReactNode; label: string; value: PrivacyVisibility }> = [
  { value: 'public', get label() { return txa('Herkese açık') }, icon: <Globe2 className="size-3.5" /> },
  { value: 'private', get label() { return txa('Gizli hesap') }, icon: <Lock className="size-3.5" /> },
]

function toAccountVisibility(value: PrivacyVisibility): PrivacyVisibility {
  return value === 'public' ? 'public' : 'private'
}

function HeaderActionFrame({
  children,
  icon,
  label,
}: {
  children: ReactNode
  icon: ReactNode
  label?: string
}) {
  return (
    <div className="flex h-[56px] items-center gap-2 rounded-[16px] border border-border/50 bg-muted/25 px-3 text-muted-foreground">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-border/40 bg-background/65">
        {icon}
      </span>
      <div className={cn('min-w-0', !label && 'flex items-center')}>
        {label ? <p className="mb-1 text-[10px] font-semibold uppercase leading-none text-muted-foreground/60">{label}</p> : null}
        {children}
      </div>
    </div>
  )
}

export function ProfileVisibilityControl({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean
  onChange: (value: PrivacyVisibility) => void
  value: PrivacyVisibility
}) {
  const selectedOption = ACCOUNT_VISIBILITY_OPTIONS.find((option) => option.value === toAccountVisibility(value)) ?? ACCOUNT_VISIBILITY_OPTIONS[0]

  return (
    <HeaderActionFrame icon={selectedOption.icon} label={txa('Hesap görünürlüğü')}>
      <Select value={toAccountVisibility(value)} disabled={disabled} onValueChange={(nextValue) => onChange(nextValue as PrivacyVisibility)}>
        <SelectTrigger size="sm" className="h-7 w-[150px] rounded-lg border-border/40 bg-background/70 text-xs font-semibold text-foreground">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {ACCOUNT_VISIBILITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="inline-flex items-center gap-2">
                  {option.icon}
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </HeaderActionFrame>
  )
}

function PrivacySettingRow({
  description,
  disabled,
  label,
  onChange,
  value,
}: {
  description: string
  disabled?: boolean
  label: string
  onChange: (value: PrivacyVisibility) => void
  value: PrivacyVisibility
}) {
  return (
    <div className="grid gap-2 rounded-[14px] border border-border/45 bg-background/55 p-2.5 sm:grid-cols-[minmax(0,1fr)_132px] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{description}</p>
      </div>
      <Select value={value} disabled={disabled} onValueChange={(nextValue) => onChange(nextValue as PrivacyVisibility)}>
        <SelectTrigger size="sm" className="h-8 rounded-lg border-border/45 bg-card/80 text-xs font-semibold text-foreground">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {PROFILE_VISIBILITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="inline-flex items-center gap-2">
                  {option.icon}
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Look Studio "Privacy and Security" tab: all visibility settings on one flat surface,
 * with segmented controls. Unlike popover versions
 * all surfaces are visible at once.
 */
export function PrivacySettingsSection({
  disabled,
  onProfileVisibilityChange,
  onSettingChange,
  profileVisibility,
  settings,
}: {
  disabled?: boolean
  onProfileVisibilityChange: (value: PrivacyVisibility) => void
  onSettingChange: (key: keyof UserPrivacySettings, value: PrivacyVisibility) => void
  profileVisibility: PrivacyVisibility
  settings: UserPrivacySettings | null
}) {
  const resolveValue = (key: keyof UserPrivacySettings): PrivacyVisibility => {
    if (key === 'profileVisibility') return toAccountVisibility(profileVisibility)
    return settings?.[key] ?? 'public'
  }

  const handleChange = (key: keyof UserPrivacySettings, value: PrivacyVisibility) => {
    if (key === 'profileVisibility') {
      onProfileVisibilityChange(value)
      return
    }
    onSettingChange(key, value)
  }

  return (
    <div className="space-y-1">
      {!settings ? (
        <p className="m-0 rounded-xl border border-border/45 bg-background/55 p-3 text-xs text-muted-foreground">
          {txa('Gizlilik ayarlari su anda yuklenemedi; yalnizca profil gorunurlugu duzenlenebilir.')}
        </p>
      ) : null}
      <div className="divide-y divide-border/40">
        {USER_PRIVACY_SURFACES.map((field) => {
          const fieldDisabled = disabled || (field.key !== 'profileVisibility' && !settings)
          const currentValue = resolveValue(field.key)
          const options = field.key === 'profileVisibility' ? ACCOUNT_VISIBILITY_OPTIONS : PROFILE_VISIBILITY_OPTIONS
          return (
            <div key={field.key} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold text-foreground">{field.label}</p>
                <p className="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">{field.detail}</p>
              </div>
              <div className="flex shrink-0 rounded-full border border-border/60 bg-background/60 p-1" role="radiogroup" aria-label={field.label}>
                {options.map((option) => {
                  const isActive = currentValue === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      disabled={fieldDisabled}
                      onClick={() => handleChange(field.key, option.value)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-55',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-[0_6px_18px_hsl(var(--primary)/0.3)]'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {option.icon}
                      <span className="hidden sm:inline">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <p className="m-0 border-t border-border/40 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        {txa('Gizli hesapta seni takip etmek isteyenler istek gönderir; profilini yalnızca onayladıkların görür. Diğer yüzeylerde "Takipçiler" yalnızca seni takip edenlere gösterir, "Sadece Ben" kimseye göstermez.')}
      </p>
    </div>
  )
}

export function PrivacySettingsControl({
  disabled,
  onChange,
  settings,
}: {
  disabled?: boolean
  onChange: (key: keyof UserPrivacySettings, value: PrivacyVisibility) => void
  settings: UserPrivacySettings | null
}) {
  return (
    <HeaderActionFrame icon={<Shield className="size-3.5" />}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || !settings}
            className="inline-flex h-7 items-center rounded-lg border border-border/40 bg-background/70 px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/35 hover:text-primary disabled:cursor-not-allowed disabled:opacity-55"
          >
            {txa('Gizlilik ayarları')}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-[min(390px,calc(100vw-2rem))] rounded-[18px] border-border/60 bg-card/95 p-3 shadow-2xl">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-black text-foreground">{txa('Gizlilik ayarları')}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {txa('Profilde görünen ana yüzeylerin kimlere açık olduğunu buradan seç.')}
              </p>
            </div>
            {settings ? (
              <div className="space-y-2">
                {USER_PRIVACY_SURFACES.map((field) => (
                  <PrivacySettingRow
                    key={field.key}
                    description={field.detail}
                    disabled={disabled}
                    label={field.label}
                    value={settings[field.key]}
                    onChange={(nextValue) => onChange(field.key, nextValue)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-[14px] border border-border/45 bg-background/55 p-3 text-xs text-muted-foreground">
                {txa('Gizlilik ayarları şu anda yüklenemedi.')}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </HeaderActionFrame>
  )
}
