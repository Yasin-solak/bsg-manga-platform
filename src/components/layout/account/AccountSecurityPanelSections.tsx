import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PrivacyVisibility, UserPrivacySettings } from '@/services/userService'
import { USER_PRIVACY_SURFACES } from '@/services/userService/privacyPresentation'
import { showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import type { AccountSecurityPanelState } from './useAccountSecurityPanelState'
import { intlLocale, txa } from '@/i18n/activeLocale'

function formatDateTime(value: string | null) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString(intlLocale())
}

function formatBlockedAt(value: string | null) {
  if (!value) return txa('Tarih bilinmiyor')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return txa('Tarih bilinmiyor')
  return parsed.toLocaleString(intlLocale())
}

function AccountSummaryCard({
  detail,
  label,
  value,
}: {
  detail?: string
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      {detail ? <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p> : null}
    </div>
  )
}

const PRIVACY_VISIBILITY_OPTIONS: Array<{ value: PrivacyVisibility; label: string; detail: string }> = [
  {
    value: 'public',
    get label() { return txa('Herkese Açık') },
    get detail() { return txa('Giriş yapmayan ziyaretçiler dahil herkes görebilir.') },
  },
  {
    value: 'followers',
    get label() { return txa('Takipçiler') },
    get detail() { return txa('Sadece seni takip eden hesaplar görebilir.') },
  },
  {
    value: 'private',
    get label() { return txa('Sadece Ben') },
    get detail() { return txa('Yalnızca sen görebilirsin.') },
  },
]

// Account visibility has two options: on a private account only approved followers see the profile.
const ACCOUNT_VISIBILITY_OPTIONS: Array<{ value: PrivacyVisibility; label: string; detail: string }> = [
  {
    value: 'public',
    get label() { return txa('Herkese Açık') },
    get detail() { return txa('Profilini herkes görebilir.') },
  },
  {
    value: 'private',
    get label() { return txa('Gizli Hesap') },
    get detail() { return txa('Takip isteğini onayladıkların görebilir.') },
  },
]

function PrivacyVisibilitySelector({
  description,
  disabled,
  label,
  value,
  onChange,
  account = false,
}: {
  description: string
  disabled?: boolean
  label: string
  value: PrivacyVisibility
  onChange: (value: PrivacyVisibility) => void
  account?: boolean
}) {
  const options = account ? ACCOUNT_VISIBILITY_OPTIONS : PRIVACY_VISIBILITY_OPTIONS
  const current = account && value !== 'public' ? 'private' : value
  const selectedOption = options.find((option) => option.value === current)

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
        <p className="text-[11px] font-medium text-primary/80">
          {selectedOption?.detail || txa('Görünürlük seçimi yapın.')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={`${label}-${option.value}`}
            type="button"
            variant={current === option.value ? 'default' : 'outline'}
            size="sm"
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function AccountOverviewSection({
  emailStatusLabel,
  loading,
  roleLabel,
  snapshot,
  username,
}: {
  emailStatusLabel: string
  loading: boolean
  roleLabel: string
  snapshot: AccountSecurityPanelState['snapshot']
  username?: string
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{txa('Hesap Özeti')}</h3>
        <p className="text-xs text-muted-foreground">{txa('Bu panel e-posta, oturum ve temel güvenlik durumunu tek yerde toplar.')}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AccountSummaryCard label={txa('Kullanıcı')} value={username ? `@${username}` : '-'} />
        <AccountSummaryCard label={txa('Rol')} value={roleLabel} />
        <AccountSummaryCard label={txa('E-posta')} value={loading ? txa('Yukleniyor...') : snapshot?.email || txa('Bulunamadı')} />
        <AccountSummaryCard
          label={txa('E-posta Durumu')}
          value={loading ? txa('Yukleniyor...') : emailStatusLabel}
          detail={snapshot?.emailVerifiedAt ? `Dogrulama: ${formatDateTime(snapshot.emailVerifiedAt)}` : txa('Doğrulama tamamlanmamış.')}
        />
      </div>
    </section>
  )
}

export function SessionStatusSection({
  loading,
  passwordResetLoading,
  sessionStatusLabel,
  signOutOthersLoading,
  snapshot,
  onPasswordReset,
  onSignOutOthers,
}: {
  loading: boolean
  passwordResetLoading: boolean
  sessionStatusLabel: string
  signOutOthersLoading: boolean
  snapshot: AccountSecurityPanelState['snapshot']
  onPasswordReset: () => void
  onSignOutOthers: () => void
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{txa('Oturum Durumu')}</h3>
        <p className="text-xs text-muted-foreground">{txa('Bu cihazdaki mevcut oturumu görüntüler ve diğer cihazlardaki açık oturumları kapatır.')}</p>
      </div>
      <Card className="border-border/70 bg-background/70">
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <AccountSummaryCard label={txa('Bu Cihaz')} value={sessionStatusLabel} detail={txa('Mevcut tarayıcı oturumu')} />
            <AccountSummaryCard label={txa('Son Giriş')} value={loading ? txa('Yukleniyor...') : formatDateTime(snapshot?.lastSignInAt || null)} />
            <AccountSummaryCard label={txa('Oturum Bitişi')} value={loading ? txa('Yukleniyor...') : formatDateTime(snapshot?.currentSessionExpiresAt || null)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onPasswordReset} disabled={passwordResetLoading}>
              {passwordResetLoading ? txa('Gönderiliyor...') : txa('Şifre Sıfırlama E-postası Gönder')}
            </Button>
            <Button variant="outline" size="sm" onClick={onSignOutOthers} disabled={signOutOthersLoading}>
              {signOutOthersLoading ? txa('Kapatılıyor...') : txa('Diğer Cihazlardan Çık')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

export function PrivacySection({
  privacyLoading,
  privacySaving,
  privacySettings,
  onChange,
  onReload,
  onSave,
}: {
  privacyLoading: boolean
  privacySaving: boolean
  privacySettings: UserPrivacySettings | null
  onChange: (key: keyof UserPrivacySettings, value: PrivacyVisibility) => void
  onReload: () => void
  onSave: () => void
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{txa('Gizlilik ve Profil Görünürlüğü')}</h3>
        <p className="text-xs text-muted-foreground">
          {txa('Profil vitrini, bağlantı izi, istatistik izi ve görünür raflarını buradan yönetebilirsin.')}
        </p>
      </div>
      <Card className="border-border/70 bg-background/70">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {privacyLoading
                ? txa('Gizlilik ayarları yükleniyor...')
                : txa('Profilde görünen her ana yüzeyi ayrı ayrı kontrol edebilirsin.')}
            </p>
            <Button variant="outline" size="sm" onClick={onReload} disabled={privacyLoading || privacySaving}>
              {privacyLoading ? txa('Yukleniyor...') : txa('Ayarları Yenile')}
            </Button>
          </div>

          {privacySettings ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {USER_PRIVACY_SURFACES.map((field) => (
                <PrivacyVisibilitySelector
                  key={field.key}
                  description={field.detail}
                  label={field.label}
                  value={privacySettings[field.key]}
                  account={field.key === 'profileVisibility'}
                  disabled={privacySaving}
                  onChange={(value) => onChange(field.key, value)}
                />
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onSave} disabled={!privacySettings || privacyLoading || privacySaving}>
              {privacySaving ? txa('Kaydediliyor...') : txa('Gizlilik Ayarlarını Kaydet')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

export function SessionHistorySection({
  revokeSessionLoadingId,
  sessionRows,
  sessionsLoading,
  onReload,
  onRevoke,
}: {
  revokeSessionLoadingId: string | null
  sessionRows: AccountSecurityPanelState['sessionRows']
  sessionsLoading: boolean
  onReload: () => void
  onRevoke: (sessionId: string) => void
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{txa('Aktif Cihazlar ve Oturum Geçmişi')}</h3>
        <p className="text-xs text-muted-foreground">
          {txa('Tek oturum kuralında aynı anda yalnızca bir cihaz aktif kalır. Bu liste son cihaz taleplerini ve tek tek kapatılan oturumları gösterir.')}
        </p>
      </div>
      <Card className="border-border/70 bg-background/70">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {sessionsLoading
                ? txa('Oturumlar yükleniyor...')
                : sessionRows.length > 0
                  ? txa('{v1} cihaz/oturum kaydı bulundu.', { v1: sessionRows.length })
                  : txa('Henüz cihaz/oturum kaydı bulunmuyor.')}
            </p>
            <Button variant="outline" size="sm" onClick={onReload} disabled={sessionsLoading}>
              {sessionsLoading ? txa('Yukleniyor...') : txa('Listeyi Yenile')}
            </Button>
          </div>

          {sessionRows.length > 0 ? (
            <div className="space-y-2">
              {sessionRows.map((sessionRow) => {
                const statusBadge = sessionRow.isCurrentDevice
                  ? txa('Bu cihaz')
                  : sessionRow.isActive
                    ? txa('Aktif')
                    : sessionRow.isRevoked
                      ? txa('Kapatıldı')
                      : txa('Geçmiş')

                return (
                  <div key={sessionRow.sessionId} className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{sessionRow.deviceLabel}</p>
                          <Badge variant={sessionRow.isCurrentDevice ? 'default' : 'outline'}>{statusBadge}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[sessionRow.browser, sessionRow.platform].filter(Boolean).join(' | ') || txa('Cihaz bilgisi sınırlı')}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{txa('Son istek: {v1}', { v1: formatDateTime(sessionRow.lastSeenAt || sessionRow.claimedAt) })}</p>
                        <p className="text-[11px] text-muted-foreground">{txa('Oturum başlangıcı: {v1}', { v1: formatDateTime(sessionRow.claimedAt) })}</p>
                        {sessionRow.isRevoked && sessionRow.revokedAt ? (
                          <p className="text-[11px] text-destructive">
                            {txa('Kapatilma:')}{' '}{formatDateTime(sessionRow.revokedAt)}
                            {sessionRow.revokeReason ? ` | ${sessionRow.revokeReason}` : ''}
                          </p>
                        ) : null}
                      </div>

                      {!sessionRow.isCurrentDevice && !sessionRow.isRevoked ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRevoke(sessionRow.sessionId)}
                          disabled={revokeSessionLoadingId === sessionRow.sessionId}
                        >
                          {revokeSessionLoadingId === sessionRow.sessionId ? txa('Kapatılıyor...') : txa('Erişimi Kapat')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}

export function MfaSection({
  disableMfaLoadingId,
  isMfaEnabled,
  mfaActionLoading,
  mfaDetailLabel,
  mfaStatusLabel,
  pendingTotpSetup,
  snapshot,
  totpCode,
  totpFriendlyName,
  unverifiedMfaFactors,
  verifiedMfaFactors,
  onCancelSetup,
  onDisableFactor,
  onStartSetup,
  onTotpCodeChange,
  onTotpFriendlyNameChange,
  onVerifySetup,
}: {
  disableMfaLoadingId: string | null
  isMfaEnabled: boolean
  mfaActionLoading: boolean
  mfaDetailLabel: string
  mfaStatusLabel: string
  pendingTotpSetup: AccountSecurityPanelState['pendingTotpSetup']
  snapshot: AccountSecurityPanelState['snapshot']
  totpCode: string
  totpFriendlyName: string
  unverifiedMfaFactors: AccountSecurityPanelState['unverifiedMfaFactors']
  verifiedMfaFactors: AccountSecurityPanelState['verifiedMfaFactors']
  onCancelSetup: () => void
  onDisableFactor: (factorId: string) => void
  onStartSetup: () => void
  onTotpCodeChange: (value: string) => void
  onTotpFriendlyNameChange: (value: string) => void
  onVerifySetup: () => void
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{txa('İki Aşamalı Doğrulama')}</h3>
        <p className="text-xs text-muted-foreground">
          {txa('Authenticator uygulaması ile TOTP kurulumu yapılır. Aktif olduğunda yeni girişler ikinci bir kod adımı ister.')}
        </p>
      </div>
      <Card className="border-border/70 bg-background/70">
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AccountSummaryCard label={txa('2FA Durumu')} value={mfaStatusLabel} detail={mfaDetailLabel} />
            <AccountSummaryCard
              label={txa('Kurulu Faktör')}
              value={!isMfaEnabled ? txa('Pasif') : verifiedMfaFactors.length > 0 ? txa('{v1} adet', { v1: verifiedMfaFactors.length }) : txa('Yok')}
              detail={!isMfaEnabled ? txa('Kurulum ve doğrulama akışı daha sonra tekrar açılacak.') : verifiedMfaFactors[0]?.friendlyName || txa('Authenticator faktörünüz henüz kurulmamış.')}
            />
          </div>

          {!isMfaEnabled ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">{txa('2FA şimdilik pasif')}</p>
                <p className="text-xs text-muted-foreground">
                  {txa('Bu özellik kod tabanında hazır tutuluyor ancak ürün kararı gereği şimdilik aktif edilmiyor. İşler büyüdüğünde aynı panelden tekrar devreye alınacak.')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="opacity-80" onClick={() => showInactiveFeatureToast('2FA kurulumu')}>
                    {txa('2FA Kurulumu')}
                  </Button>
                </div>
              </div>
            </div>
          ) : snapshot?.mfaStatus === 'unknown' ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {txa('2FA durumu okunamadı. Supabase Auth ayarlarında TOTP/MFA özelliğinin açık olduğunu kontrol edin.')}
            </div>
          ) : null}

          {isMfaEnabled && verifiedMfaFactors.length > 0 ? (
            <div className="space-y-2">
              {verifiedMfaFactors.map((factor) => (
                <div key={factor.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{factor.friendlyName || txa('Authenticator')}</p>
                      <Badge variant="secondary">{txa('Aktif')}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {txa('Tur:')}{' '}{factor.factorType.toUpperCase()}{' '}{txa('| Son kullanma:')}{' '}{formatDateTime(factor.lastChallengedAt)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{txa('Kurulum:')}{' '}{formatDateTime(factor.createdAt)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDisableFactor(factor.id)}
                    disabled={disableMfaLoadingId === factor.id}
                  >
                    {disableMfaLoadingId === factor.id ? txa('Kaldırılıyor...') : txa('2FA Kaldır')}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {isMfaEnabled && pendingTotpSetup ? (
            <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{txa('2FA kurulumunu tamamla')}</p>
                <p className="text-xs text-muted-foreground">
                  {txa('QR kodu authenticator uygulamanla tara. Uygulamanın verdiği 6 haneli kodu aşağıda doğrula.')}
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex items-center justify-center rounded-lg border border-border bg-background p-3">
                  <img src={pendingTotpSetup.qrCodeDataUrl} alt={txa('2FA QR kodu')} className="h-40 w-40 rounded-md object-contain" />
                </div>

                <div className="flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="account-mfa-secret">{txa('Kurulum anahtarı')}</Label>
                    <Input id="account-mfa-secret" readOnly value={pendingTotpSetup.secret} className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="account-mfa-code">{txa('Authenticator kodu')}</Label>
                    <Input
                      id="account-mfa-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={totpCode}
                      onChange={(event) => onTotpCodeChange(event.target.value.replace(/[^\d\s]/g, '').slice(0, 8))}
                      placeholder="000000"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={onVerifySetup} disabled={mfaActionLoading}>
                      {mfaActionLoading ? txa('Doğrulanıyor...') : txa('2FA Kurulumunu Tamamla')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={onCancelSetup} disabled={mfaActionLoading}>
                      {mfaActionLoading ? txa('İptal ediliyor...') : txa('Kurulumu İptal Et')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : isMfaEnabled && verifiedMfaFactors.length === 0 ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{txa('2FA kurulumunu başlat')}</p>
                <p className="text-xs text-muted-foreground">
                  {txa('Google Authenticator, 1Password veya benzeri bir uygulama kullanarak 2FA açabilirsin.')}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account-mfa-friendly-name">{txa('Cihaz adı (isteğe bağlı)')}</Label>
                <Input
                  id="account-mfa-friendly-name"
                  value={totpFriendlyName}
                  onChange={(event) => onTotpFriendlyNameChange(event.target.value)}
                  placeholder={txa('Ornek: Telefonum')}
                  maxLength={64}
                />
              </div>
              {unverifiedMfaFactors.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {txa('Yarım kalmış bir 2FA kurulumu bulundu. Yeni kurulum başlatılırken otomatik temizlenecek.')}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={onStartSetup} disabled={mfaActionLoading}>
                  {mfaActionLoading ? txa('Hazırlanıyor...') : txa('2FA Kurulumunu Başlat')}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}

export function BlockedUsersSection({
  blockedUsers,
  blockedUsersLoading,
  unblockLoadingUserId,
  onReload,
  onUnblock,
}: {
  blockedUsers: AccountSecurityPanelState['blockedUsers']
  blockedUsersLoading: boolean
  unblockLoadingUserId: string | null
  onReload: () => void
  onUnblock: (userId: string) => void
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{txa('Engellenen Kullanıcılar')}</h3>
        <p className="text-xs text-muted-foreground">{txa('Engellediğin kullanıcılar burada listelenir. İstersen bu panelden engeli kaldırabilirsin.')}</p>
      </div>
      <Card className="border-border/70 bg-background/70">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {blockedUsersLoading
                ? txa('Liste yükleniyor...')
                : blockedUsers.length > 0
                  ? txa('{v1} kullanıcı engelli durumda.', { v1: blockedUsers.length })
                  : txa('Şu anda engellediğin bir kullanıcı yok.')}
            </p>
            <Button variant="outline" size="sm" onClick={onReload} disabled={blockedUsersLoading}>
              {blockedUsersLoading ? txa('Yukleniyor...') : txa('Listeyi Yenile')}
            </Button>
          </div>
          {blockedUsers.length > 0 ? (
            <div className="space-y-2">
              {blockedUsers.map((blockedUser) => (
                <div key={blockedUser.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <img src={blockedUser.avatar} alt={blockedUser.username} className="h-10 w-10 rounded-full border border-border object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">@{blockedUser.username}</p>
                      <p className="text-[11px] text-muted-foreground">{txa('Engelleme:')}{' '}{formatBlockedAt(blockedUser.blockedAt)}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUnblock(blockedUser.id)}
                    disabled={unblockLoadingUserId === blockedUser.id}
                  >
                    {unblockLoadingUserId === blockedUser.id ? txa('Kaldırılıyor...') : txa('Engeli Kaldır')}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
