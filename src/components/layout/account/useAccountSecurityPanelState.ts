import { useCallback, useEffect, useMemo, useState } from 'react'
import { isMfaFeatureEnabled } from '@/services/accountSecurityFeatureService'
import {
  beginTotpEnrollment,
  disableMfaFactor,
  getMyAccountSecuritySnapshot,
  listMyAccountSessions,
  revokeAccountSession,
  sendPasswordResetForCurrentUser,
  signOutOtherSessions,
  verifyTotpEnrollment,
  type AccountSecuritySnapshot,
  type AccountSessionEntry,
  type TotpEnrollmentSetup,
} from '@/services/accountCenterService'
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from '@/services/notificationService'
import { userService, type BlockedUserSummary, type PrivacyVisibility, type UserPrivacySettings } from '@/services/userService'
import { toast } from '@/services/toastService'
import { createScopedLogger } from '@/services/logger'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { txa } from '@/i18n/activeLocale'

const accountSecurityLogger = createScopedLogger('AccountSecurityPanel')

type UseAccountSecurityPanelStateOptions = {
  open: boolean
  scope?: 'all' | 'account' | 'privacy' | 'security'
}

export type AccountSecurityPanelState = {
  loadErrors: { snapshot: boolean; sessions: boolean; blocked: boolean; privacy: boolean; notifications: boolean }
  loading: boolean
  passwordResetLoading: boolean
  signOutOthersLoading: boolean
  snapshot: AccountSecuritySnapshot | null
  sessionRows: AccountSessionEntry[]
  sessionsLoading: boolean
  revokeSessionLoadingId: string | null
  blockedUsers: BlockedUserSummary[]
  blockedUsersLoading: boolean
  unblockLoadingUserId: string | null
  privacySettings: UserPrivacySettings | null
  privacyLoading: boolean
  privacySaving: boolean
  notificationPreferences: NotificationPreferences | null
  notificationPreferencesLoading: boolean
  notificationPreferencesSaving: boolean
  pendingTotpSetup: TotpEnrollmentSetup | null
  totpFriendlyName: string
  totpCode: string
  mfaActionLoading: boolean
  disableMfaLoadingId: string | null
  isMfaEnabled: boolean
  verifiedMfaFactors: Array<NonNullable<AccountSecuritySnapshot['mfaState']>['factors'][number]>
  unverifiedMfaFactors: Array<NonNullable<AccountSecuritySnapshot['mfaState']>['factors'][number]>
  emailStatusLabel: string
  sessionStatusLabel: string
  mfaStatusLabel: string
  mfaDetailLabel: string
  setTotpFriendlyName: (value: string) => void
  setTotpCode: (value: string) => void
  loadSnapshot: () => Promise<void>
  loadBlockedUsers: () => Promise<void>
  loadSessions: () => Promise<void>
  loadPrivacySettings: () => Promise<void>
  loadNotificationPreferences: () => Promise<void>
  handlePasswordReset: () => Promise<void>
  handleSignOutOthers: () => Promise<void>
  handleUnblockUser: (userId: string) => Promise<void>
  handleRevokeSession: (sessionId: string) => Promise<void>
  handlePrivacyChange: (key: keyof UserPrivacySettings, value: PrivacyVisibility) => void
  handleSavePrivacySettings: () => Promise<void>
  handleNotificationPreferenceChange: (key: NotificationPreferenceKey, value: boolean) => void
  handleSaveNotificationPreferences: () => Promise<void>
  handleStartTotpSetup: () => Promise<void>
  handleVerifyTotpSetup: () => Promise<void>
  handleCancelTotpSetup: () => Promise<void>
  handleDisableMfaFactor: (factorId: string) => Promise<void>
}

export function useAccountSecurityPanelState({
  open,
  scope = 'all',
}: UseAccountSecurityPanelStateOptions): AccountSecurityPanelState {
  const [loadErrors, setLoadErrors] = useState({ snapshot: false, sessions: false, blocked: false, privacy: false, notifications: false })
  const [loading, setLoading] = useState(false)
  const [passwordResetLoading, setPasswordResetLoading] = useState(false)
  const [signOutOthersLoading, setSignOutOthersLoading] = useState(false)
  const [snapshot, setSnapshot] = useState<AccountSecuritySnapshot | null>(null)
  const [sessionRows, setSessionRows] = useState<AccountSessionEntry[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [revokeSessionLoadingId, setRevokeSessionLoadingId] = useState<string | null>(null)
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserSummary[]>([])
  const [blockedUsersLoading, setBlockedUsersLoading] = useState(false)
  const [unblockLoadingUserId, setUnblockLoadingUserId] = useState<string | null>(null)
  const [privacySettings, setPrivacySettings] = useState<UserPrivacySettings | null>(null)
  const [privacyLoading, setPrivacyLoading] = useState(false)
  const [privacySaving, setPrivacySaving] = useState(false)
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null)
  const [notificationPreferencesLoading, setNotificationPreferencesLoading] = useState(false)
  const [notificationPreferencesSaving, setNotificationPreferencesSaving] = useState(false)
  const [pendingTotpSetup, setPendingTotpSetup] = useState<TotpEnrollmentSetup | null>(null)
  const [totpFriendlyName, setTotpFriendlyName] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [mfaActionLoading, setMfaActionLoading] = useState(false)
  const [disableMfaLoadingId, setDisableMfaLoadingId] = useState<string | null>(null)
  const isMfaEnabled = isMfaFeatureEnabled()

  const loadSnapshot = useCallback(async () => {
    setLoadErrors(previous => ({ ...previous, snapshot: false }))
    setLoading(true)
    try {
      const nextSnapshot = await getMyAccountSecuritySnapshot()
      setSnapshot(nextSnapshot)
    } catch (error) {
      setLoadErrors(previous => ({ ...previous, snapshot: true }))
      accountSecurityLogger.error('loadSnapshot failed', error)
      toast.error(txa('Hesap güvenliği verisi yüklenemedi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadBlockedUsers = useCallback(async () => {
    setLoadErrors(previous => ({ ...previous, blocked: false }))
    setBlockedUsersLoading(true)
    try {
      const nextBlockedUsers = await userService.listBlockedUsers()
      setBlockedUsers(nextBlockedUsers)
    } catch (error) {
      setLoadErrors(previous => ({ ...previous, blocked: true }))
      accountSecurityLogger.error('loadBlockedUsers failed', error)
      toast.error(txa('Engellenen kullanıcılar listesi yüklenemedi.'))
    } finally {
      setBlockedUsersLoading(false)
    }
  }, [])

  const loadSessions = useCallback(async () => {
    setLoadErrors(previous => ({ ...previous, sessions: false }))
    setSessionsLoading(true)
    try {
      const nextSessions = await listMyAccountSessions()
      setSessionRows(nextSessions)
    } catch (error) {
      setLoadErrors(previous => ({ ...previous, sessions: true }))
      accountSecurityLogger.error('loadSessions failed', error)
      toast.error(toUserFacingErrorMessage(error, txa('Oturum listesi yüklenemedi.')))
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  const loadPrivacySettings = useCallback(async () => {
    setLoadErrors(previous => ({ ...previous, privacy: false }))
    setPrivacyLoading(true)
    try {
      const nextSettings = await userService.getMyPrivacySettings()
      setPrivacySettings(nextSettings)
    } catch (error) {
      setLoadErrors(previous => ({ ...previous, privacy: true }))
      accountSecurityLogger.error('loadPrivacySettings failed', error)
      toast.error(toUserFacingErrorMessage(error, txa('Gizlilik ayarları yüklenemedi.')))
    } finally {
      setPrivacyLoading(false)
    }
  }, [])

  const loadNotificationPreferences = useCallback(async () => {
    setLoadErrors(previous => ({ ...previous, notifications: false }))
    setNotificationPreferencesLoading(true)
    try {
      const nextPreferences = await getMyNotificationPreferences()
      setNotificationPreferences(nextPreferences)
    } catch (error) {
      setLoadErrors(previous => ({ ...previous, notifications: true }))
      accountSecurityLogger.error('loadNotificationPreferences failed', error)
      toast.error(toUserFacingErrorMessage(error, txa('Bildirim tercihleri yüklenemedi.')))
    } finally {
      setNotificationPreferencesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (scope === 'all' || scope === 'account' || scope === 'security') void loadSnapshot()
    if (scope === 'all' || scope === 'security') void loadSessions()
    if (scope === 'all' || scope === 'privacy') { void loadBlockedUsers(); void loadPrivacySettings() }
    if (scope === 'all') void loadNotificationPreferences()
  }, [loadBlockedUsers, loadNotificationPreferences, loadPrivacySettings, loadSessions, loadSnapshot, open, scope])

  const verifiedMfaFactors = useMemo(
    () => snapshot?.mfaState?.factors.filter((factor) => factor.status === 'verified') || [],
    [snapshot?.mfaState?.factors],
  )

  const unverifiedMfaFactors = useMemo(
    () => snapshot?.mfaState?.factors.filter((factor) => factor.status === 'unverified') || [],
    [snapshot?.mfaState?.factors],
  )

  const emailStatusLabel = useMemo(() => {
    if (!snapshot?.email) return txa('Bilinmiyor')
    return snapshot.emailVerifiedAt ? txa('Doğrulandı') : txa('Beklemede')
  }, [snapshot?.email, snapshot?.emailVerifiedAt])

  const sessionStatusLabel = useMemo(() => {
    if (!snapshot?.currentSessionExpiresAt) return txa('Belirsiz')
    const expiry = new Date(snapshot.currentSessionExpiresAt)
    if (Number.isNaN(expiry.getTime())) return txa('Belirsiz')
    return expiry.getTime() > Date.now() ? txa('Aktif') : txa('Süresi dolmuş')
  }, [snapshot?.currentSessionExpiresAt])

  const mfaStatusLabel = useMemo(() => {
    if (!isMfaEnabled) return txa('Şu anda aktif değil')
    if (loading) return txa('2FA durumu yükleniyor...')
    if (snapshot?.mfaStatus === 'enabled') return txa('2FA aktif')
    if (snapshot?.mfaStatus === 'disabled') return txa('2FA kapalı')
    return txa('2FA durumu doğrulanamadı')
  }, [isMfaEnabled, loading, snapshot?.mfaStatus])

  const mfaDetailLabel = useMemo(() => {
    if (!isMfaEnabled) {
      return txa('2FA kodlandı ancak yayın kararı gereği şimdilik görünür pasif modda tutuluyor.')
    }
    if (!snapshot?.mfaState) {
      return txa('Supabase MFA durumu okunamadı. Gerekirse dashboard ayarlarını kontrol edin.')
    }

    const currentLevel = snapshot.mfaState.currentLevel || 'aal1'
    const nextLevel = snapshot.mfaState.nextLevel || currentLevel
    return `Oturum seviyesi: ${currentLevel.toUpperCase()} | Beklenen sonraki seviye: ${nextLevel.toUpperCase()}`
  }, [isMfaEnabled, snapshot?.mfaState])

  const handlePasswordReset = useCallback(async () => {
    setPasswordResetLoading(true)
    try {
      await sendPasswordResetForCurrentUser(window.location.origin)
      toast.success(txa('Şifre sıfırlama e-postası gönderildi.'))
    } catch (error) {
      accountSecurityLogger.error('handlePasswordReset failed', error)
      toast.error(toUserFacingErrorMessage(error, txa('Şifre sıfırlama başarısız.')))
    } finally {
      setPasswordResetLoading(false)
    }
  }, [])

  const handleSignOutOthers = useCallback(async () => {
    setSignOutOthersLoading(true)
    try {
      await signOutOtherSessions()
      toast.success(txa('Diğer cihazlardaki oturumlar kapatıldı.'))
      await loadSnapshot()
      await loadSessions()
    } catch (error) {
      accountSecurityLogger.error('handleSignOutOthers failed', error)
      toast.error(txa('Diğer cihazlardaki oturumlar kapatılamadı.'))
    } finally {
      setSignOutOthersLoading(false)
    }
  }, [loadSessions, loadSnapshot])

  const handleUnblockUser = useCallback(async (userId: string) => {
    setUnblockLoadingUserId(userId)
    try {
      await userService.unblockUser(userId)
      setBlockedUsers((prev) => prev.filter((item) => item.id !== userId))
      toast.success(txa('Kullanıcı engeli kaldırıldı.'))
    } catch (error) {
      accountSecurityLogger.error('handleUnblockUser failed', error)
      toast.error(txa('Kullanıcı engeli kaldırılamadı.'))
    } finally {
      setUnblockLoadingUserId(null)
    }
  }, [])

  const handleRevokeSession = useCallback(async (sessionId: string) => {
    setRevokeSessionLoadingId(sessionId)
    try {
      await revokeAccountSession(sessionId, txa('Hesap merkezi üzerinden kullanıcı tarafından kapatıldı.'))
      toast.success(txa('Seçilen oturum kapatıldı.'))
      await loadSnapshot()
      await loadSessions()
    } catch (error) {
      accountSecurityLogger.error('handleRevokeSession failed', error)
      toast.error(toUserFacingErrorMessage(error, txa('Seçilen oturum kapatılamadı.')))
    } finally {
      setRevokeSessionLoadingId(null)
    }
  }, [loadSessions, loadSnapshot])

  const handlePrivacyChange = useCallback((key: keyof UserPrivacySettings, value: PrivacyVisibility) => {
    setPrivacySettings((prev) => {
      const base: UserPrivacySettings = prev || {
        profileVisibility: 'public',
        statsVisibility: 'public',
        socialLinksVisibility: 'public',
        activityVisibility: 'public',
      }

      return {
        ...base,
        [key]: value,
      }
    })
  }, [])

  const handleSavePrivacySettings = useCallback(async () => {
    if (!privacySettings) return
    setPrivacySaving(true)
    try {
      const nextSettings = await userService.updateMyPrivacySettings(privacySettings)
      setPrivacySettings(nextSettings)
      toast.success(txa('Gizlilik ayarları kaydedildi.'))
    } catch (error) {
      accountSecurityLogger.error('handleSavePrivacySettings failed', error)
      toast.error(toUserFacingErrorMessage(error, txa('Gizlilik ayarları kaydedilemedi.')))
    } finally {
      setPrivacySaving(false)
    }
  }, [privacySettings])

  const handleNotificationPreferenceChange = useCallback((key: NotificationPreferenceKey, value: boolean) => {
    setNotificationPreferences((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [key]: value,
      }
    })
  }, [])

  const handleSaveNotificationPreferences = useCallback(async () => {
    if (!notificationPreferences) return
    setNotificationPreferencesSaving(true)
    try {
      const nextPreferences = await updateMyNotificationPreferences(notificationPreferences)
      setNotificationPreferences(nextPreferences)
      toast.success(txa('Bildirim tercihleri kaydedildi.'))
    } catch (error) {
      accountSecurityLogger.error('handleSaveNotificationPreferences failed', error)
      toast.error(toUserFacingErrorMessage(error, txa('Bildirim tercihleri kaydedilemedi.')))
    } finally {
      setNotificationPreferencesSaving(false)
    }
  }, [notificationPreferences])

  const handleStartTotpSetup = useCallback(async () => {
    setMfaActionLoading(true)
    try {
      const setup = await beginTotpEnrollment(totpFriendlyName)
      setPendingTotpSetup(setup)
      setTotpCode('')
      await loadSnapshot()
      toast.success(txa('2FA kurulumu hazırlandı. QR kodu uygulamanızla taratın.'))
    } catch (error) {
      accountSecurityLogger.error('handleStartTotpSetup failed', error)
      toast.error(toUserFacingErrorMessage(error, txa('2FA kurulumu başlatılamadı.')))
    } finally {
      setMfaActionLoading(false)
    }
  }, [loadSnapshot, totpFriendlyName])

  const handleVerifyTotpSetup = useCallback(async () => {
    if (!pendingTotpSetup) {
      toast.error(txa('Bekleyen bir 2FA kurulumu bulunamadı.'))
      return
    }

    setMfaActionLoading(true)
    try {
      const nextSnapshot = await verifyTotpEnrollment(pendingTotpSetup.factorId, totpCode)
      setSnapshot(nextSnapshot)
      setPendingTotpSetup(null)
      setTotpCode('')
      setTotpFriendlyName('')
      await loadSessions()
      toast.success(txa('2FA başarıyla aktif edildi.'))
    } catch (error) {
      accountSecurityLogger.error('handleVerifyTotpSetup failed', error)
      toast.error(toUserFacingErrorMessage(error, txa('2FA doğrulaması başarısız oldu.')))
    } finally {
      setMfaActionLoading(false)
    }
  }, [loadSessions, pendingTotpSetup, totpCode])

  const handleCancelTotpSetup = useCallback(async () => {
    if (!pendingTotpSetup) {
      setTotpCode('')
      return
    }

    setMfaActionLoading(true)
    try {
      const nextSnapshot = await disableMfaFactor(pendingTotpSetup.factorId)
      setSnapshot(nextSnapshot)
      setPendingTotpSetup(null)
      setTotpCode('')
      toast.success(txa('Bekleyen 2FA kurulumu iptal edildi.'))
    } catch (error) {
      accountSecurityLogger.error('handleCancelTotpSetup failed', error)
      toast.error(toUserFacingErrorMessage(error, txa('Bekleyen 2FA kurulumu iptal edilemedi.')))
    } finally {
      setMfaActionLoading(false)
    }
  }, [pendingTotpSetup])

  const handleDisableMfaFactor = useCallback(async (factorId: string) => {
    setDisableMfaLoadingId(factorId)
    try {
      const nextSnapshot = await disableMfaFactor(factorId)
      setSnapshot(nextSnapshot)
      setPendingTotpSetup(null)
      setTotpCode('')
      toast.success(txa('2FA kaldırıldı.'))
    } catch (error) {
      accountSecurityLogger.error('handleDisableMfaFactor failed', error)
      toast.error(toUserFacingErrorMessage(error, txa('2FA kaldırılamadı.')))
    } finally {
      setDisableMfaLoadingId(null)
    }
  }, [])

  return {
    loadErrors,
    loading,
    passwordResetLoading,
    signOutOthersLoading,
    snapshot,
    sessionRows,
    sessionsLoading,
    revokeSessionLoadingId,
    blockedUsers,
    blockedUsersLoading,
    unblockLoadingUserId,
    privacySettings,
    privacyLoading,
    privacySaving,
    notificationPreferences,
    notificationPreferencesLoading,
    notificationPreferencesSaving,
    pendingTotpSetup,
    totpFriendlyName,
    totpCode,
    mfaActionLoading,
    disableMfaLoadingId,
    isMfaEnabled,
    verifiedMfaFactors,
    unverifiedMfaFactors,
    emailStatusLabel,
    sessionStatusLabel,
    mfaStatusLabel,
    mfaDetailLabel,
    setTotpFriendlyName,
    setTotpCode,
    loadSnapshot,
    loadBlockedUsers,
    loadSessions,
    loadPrivacySettings,
    loadNotificationPreferences,
    handlePasswordReset,
    handleSignOutOthers,
    handleUnblockUser,
    handleRevokeSession,
    handlePrivacyChange,
    handleSavePrivacySettings,
    handleNotificationPreferenceChange,
    handleSaveNotificationPreferences,
    handleStartTotpSetup,
    handleVerifyTotpSetup,
    handleCancelTotpSetup,
    handleDisableMfaFactor,
  }
}
