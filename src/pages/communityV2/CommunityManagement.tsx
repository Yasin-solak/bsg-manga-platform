import { useState } from 'react'
import type { ManagerProps } from './management/types'
import { allowedManagementTabs } from '@/lib/communityManagementPolicy'
import { CommunityModal } from './CommunityShared'
import { ServerProfilePanel } from './management/ServerProfilePanel'
import { JoinRequestsPanel } from './management/JoinRequestsPanel'
import { RolePreviewPanel } from './management/RolePreviewPanel'
import { RolesPanel } from './management/RolesPanel'
import { ChannelsPanel } from './management/ChannelsPanel'
import { MembersPanel } from './management/MembersPanel'
import { ReportsPanel } from './management/ReportsPanel'
import { AuditPanel } from './management/AuditPanel'
import { InvitesPanel } from './management/InvitesPanel'
import { txa } from '@/i18n/activeLocale'

export function CommunityManagement(props: ManagerProps & { onClose: () => void }) {
  const tabs = allowedManagementTabs(props.server)
  const [selected, setSelected] = useState<string>(tabs[0]?.[0] || '')
  // Live loss of permission also closes the open management section.
  const tab = tabs.some(([id]) => id === selected) ? selected : tabs[0]?.[0]
  return <CommunityModal title={txa('Sunucu yönetimi')} description={txa('Roller, kanal düzeni ve üye erişimleri.')} wide onClose={props.onClose}>
    <nav className="cv2-tabs" aria-label={txa('Sunucu yönetimi bölümleri')}>
      {tabs.map(([id, name]) => <button key={id} aria-pressed={tab === id} onClick={() => setSelected(id)}>{name}</button>)}
    </nav>
    <div className="cv2-management-body">
      {!tab && <p className="cv2-hint">{txa('Şu anda sunucu yönetimine erişimin yok.')}</p>}
      {tab === 'profile' && <ServerProfilePanel {...props} />}
      {tab === 'requests' && <JoinRequestsPanel {...props} />}
      {tab === 'preview' && <RolePreviewPanel {...props} />}
      {tab === 'roles' && <RolesPanel {...props} />}
      {tab === 'channels' && <ChannelsPanel {...props} />}
      {tab === 'members' && <MembersPanel {...props} />}
      {tab === 'reports' && <ReportsPanel {...props} />}
      {tab === 'invites' && <InvitesPanel {...props} />}
      {tab === 'audit' && <AuditPanel serverId={props.serverId} roles={props.server.roles} />}
    </div>
  </CommunityModal>
}
