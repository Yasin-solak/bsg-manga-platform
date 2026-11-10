import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LinkedDiscordAccount } from './account/LinkedDiscordAccount'
import { Separator } from '@/components/ui/separator'
import { NotificationPreferenceSection } from '@/components/layout/account/NotificationPreferenceSection'
import {
  AccountOverviewSection,
  BlockedUsersSection,
  MfaSection,
  PrivacySection,
  SessionHistorySection,
  SessionStatusSection,
} from '@/components/layout/account/AccountSecurityPanelSections'
import { useAccountSecurityPanelState } from '@/components/layout/account/useAccountSecurityPanelState'
import { txa } from '@/i18n/activeLocale'

type AccountSecurityPanelProps = {
  open: boolean
  username?: string
  roleLabel: string
}

export default function AccountSecurityPanel({
  open,
  roleLabel,
  username,
}: AccountSecurityPanelProps) {
  const state = useAccountSecurityPanelState({ open })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{txa('Hesap Merkezi')}</Badge>
        <Button variant="outline" size="sm" onClick={() => void state.loadSnapshot()} disabled={state.loading}>
          {state.loading ? txa('Yukleniyor...') : txa('Yenile')}
        </Button>
      </div>

      <AccountOverviewSection
        emailStatusLabel={state.emailStatusLabel}
        loading={state.loading}
        roleLabel={roleLabel}
        snapshot={state.snapshot}
        username={username}
      />

      {open && <LinkedDiscordAccount />}

      <Separator />

      <SessionStatusSection
        loading={state.loading}
        passwordResetLoading={state.passwordResetLoading}
        sessionStatusLabel={state.sessionStatusLabel}
        signOutOthersLoading={state.signOutOthersLoading}
        snapshot={state.snapshot}
        onPasswordReset={() => void state.handlePasswordReset()}
        onSignOutOthers={() => void state.handleSignOutOthers()}
      />

      <Separator />

      <PrivacySection
        privacyLoading={state.privacyLoading}
        privacySaving={state.privacySaving}
        privacySettings={state.privacySettings}
        onChange={state.handlePrivacyChange}
        onReload={() => void state.loadPrivacySettings()}
        onSave={() => void state.handleSavePrivacySettings()}
      />

      <Separator />

      <NotificationPreferenceSection
        loading={state.notificationPreferencesLoading}
        preferences={state.notificationPreferences}
        saving={state.notificationPreferencesSaving}
        onChange={state.handleNotificationPreferenceChange}
        onReload={() => void state.loadNotificationPreferences()}
        onSave={() => void state.handleSaveNotificationPreferences()}
      />

      <Separator />

      <SessionHistorySection
        revokeSessionLoadingId={state.revokeSessionLoadingId}
        sessionRows={state.sessionRows}
        sessionsLoading={state.sessionsLoading}
        onReload={() => void state.loadSessions()}
        onRevoke={(sessionId) => void state.handleRevokeSession(sessionId)}
      />

      <Separator />

      <MfaSection
        disableMfaLoadingId={state.disableMfaLoadingId}
        isMfaEnabled={state.isMfaEnabled}
        mfaActionLoading={state.mfaActionLoading}
        mfaDetailLabel={state.mfaDetailLabel}
        mfaStatusLabel={state.mfaStatusLabel}
        pendingTotpSetup={state.pendingTotpSetup}
        snapshot={state.snapshot}
        totpCode={state.totpCode}
        totpFriendlyName={state.totpFriendlyName}
        unverifiedMfaFactors={state.unverifiedMfaFactors}
        verifiedMfaFactors={state.verifiedMfaFactors}
        onCancelSetup={() => void state.handleCancelTotpSetup()}
        onDisableFactor={(factorId) => void state.handleDisableMfaFactor(factorId)}
        onStartSetup={() => void state.handleStartTotpSetup()}
        onTotpCodeChange={state.setTotpCode}
        onTotpFriendlyNameChange={state.setTotpFriendlyName}
        onVerifySetup={() => void state.handleVerifyTotpSetup()}
      />

      <Separator />

      <BlockedUsersSection
        blockedUsers={state.blockedUsers}
        blockedUsersLoading={state.blockedUsersLoading}
        unblockLoadingUserId={state.unblockLoadingUserId}
        onReload={() => void state.loadBlockedUsers()}
        onUnblock={(userId) => void state.handleUnblockUser(userId)}
      />
    </div>
  )
}
