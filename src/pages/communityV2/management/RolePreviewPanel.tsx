import { useEffect, useState } from 'react'
import { communityPersonal, type CommunityRolePreview } from '@/services/communityPersonalService'
import { COMMUNITY_PERMISSIONS } from '@/services/communityV2Service'
import { CommunityLoading } from '../CommunityShared'
import { communityError } from '../communityHelpers'
import type { ManagerProps } from './types'
import { txa } from '@/i18n/activeLocale'

export function RolePreviewPanel({ serverId, server }: ManagerProps) {
  const [roles, setRoles] = useState<string[]>([]), [result, setResult] = useState<CommunityRolePreview | null>(null), [error, setError] = useState('')
  useEffect(() => { let live = true; setResult(null); void communityPersonal.rolePreview(serverId, roles).then(v => { if (live) { setResult(v); setError('') } }).catch(e => { if (live) setError(communityError(e)) }); return () => { live = false } }, [serverId, roles, server])
  return <div className="cv2-role-form"><p className="cv2-notice">{txa('Seçili rollerin birleşimini inceliyorsun. Herkes rolü daima dahil. Sahip ayrıcalığı, yaş koşulları ve kişisel yaptırımlar bu önizlemeye dahil değildir; kendi erişemediğin özel odalar gösterilmez.')}</p><fieldset><legend>{txa('Roller')}</legend>{server.roles.filter(r => !r.is_default).map(r => <label className="cv2-check" key={r.id}><input type="checkbox" checked={roles.includes(r.id)} onChange={e => setRoles(previous => e.target.checked ? [...previous, r.id] : previous.filter(id => id !== r.id))} /><span style={{ color: r.color }}>{r.icon} {r.name}</span></label>)}</fieldset>
    {error && <p role="alert" className="cv2-error">{error}</p>}{!result && !error ? <CommunityLoading /> : result && <><h3>{txa('İzinler')}</h3><ul>{result.permissions.map(p => <li key={p}>{COMMUNITY_PERMISSIONS.find(([key]) => key === p)?.[1] || p}</li>)}</ul><h3>{txa('Görünen kanallar')}</h3>{result.channels.map(c => <p key={c.id}>#{c.name} · {c.can_read ? c.can_send ? txa('Okuma ve yazma') : txa('Yalnız okuma') : txa('Mesajlara erişim yok')}</p>)}{!result.channels.length && <p>{txa('Görünen kanal yok.')}</p>}</>}
  </div>
}
