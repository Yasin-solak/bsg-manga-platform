import { SessionHistorySection, MfaSection, BlockedUsersSection } from '@/components/layout/account/AccountSecurityPanelSections'
import type { AccountSecurityPanelState } from '@/components/layout/account/useAccountSecurityPanelState'
import { txa } from '@/i18n/activeLocale'
export function SettingsSecurityDetails({ detail, state }: { detail: 'sessions' | 'mfa' | 'blocked' | null; state: AccountSecurityPanelState }) {
  if (detail === 'sessions' && state.loadErrors.sessions) return <p role="alert">{txa('Bilgiler yüklenemedi.')} <button className="settings-action" onClick={() => void state.loadSessions()}>{txa('Tekrar dene')}</button></p>
  if (detail === 'sessions') return <SessionHistorySection
        revokeSessionLoadingId={state.revokeSessionLoadingId}
        sessionRows={state.sessionRows}
        sessionsLoading={state.sessionsLoading}
        onReload={() => void state.loadSessions()}
        onRevoke={(sessionId) => void state.handleRevokeSession(sessionId)}
      />
  if (detail === 'mfa') return <MfaSection
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
  if (detail === 'blocked' && state.loadErrors.blocked) return <p role="alert">{txa('Bilgiler yüklenemedi.')} <button className="settings-action" onClick={() => void state.loadBlockedUsers()}>{txa('Tekrar dene')}</button></p>
  if (detail === 'blocked') return <BlockedUsersSection
        blockedUsers={state.blockedUsers}
        blockedUsersLoading={state.blockedUsersLoading}
        unblockLoadingUserId={state.unblockLoadingUserId}
        onReload={() => void state.loadBlockedUsers()}
        onUnblock={(userId) => void state.handleUnblockUser(userId)}
      />
  return null
}
