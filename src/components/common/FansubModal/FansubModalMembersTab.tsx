import type { MembersTabProps } from './FansubModalTabPanels.types'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function FansubModalMembersTab({
  members,
  loading,
  hasMemberChanges,
  onRoleChange,
  onRemoveMember,
  onSaveMemberChanges,
}: MembersTabProps) {
  return (
    <div className="spm-members-list">
      {members.length === 0 && <p className="spm-empty-text">{txa('Henüz hiç üye yok.')}</p>}

      {members.map((member) => (
        <div
          key={member.id}
          className="spm-member-item"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px',
            background: '#252525',
            border: '1px solid #333',
            borderRadius: '12px',
            marginBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img loading="lazy" decoding="async"
              src={
                member.avatar ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${member.username}`
              }
              alt={member.username}
              style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #ddd' }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{member.username}</div>
              <div style={{ fontSize: '0.8rem', color: '#666' }}>
                {txa('Katilim:')}{' '}
                {new Date(member.created_at || Date.now()).toLocaleDateString(intlLocale())}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              value={member.role}
              onChange={(event) => onRoleChange(member.id, event.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                fontSize: '0.85rem',
                background: '#fff',
                cursor: 'pointer',
              }}
              disabled={loading}
            >
              <option value="admin">{txa('Admin')}</option>
              <option value="moderator">{txa('Moderator')}</option>
              <option value="member">{txa('Üye')}</option>
            </select>

            <button
              type="button"
              onClick={() => void onRemoveMember(member)}
              style={{
                padding: '4px 8px',
                background: '#ff4d4f',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
              title={txa('Üyeyi Çıkar')}
            >
              X
            </button>
          </div>
        </div>
      ))}

      {hasMemberChanges && (
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="spm-btn spm-btn-save"
            onClick={() => void onSaveMemberChanges()}
          >
            {txa('Üye Değişikliklerini Kaydet')}
          </button>
        </div>
      )}
    </div>
  )
}
