import { useId, type ReactNode } from 'react'
export function SettingsRow({ title, description, children }: { title: string; description: ReactNode; children?: ReactNode }) {
  return <div className="settings-row"><div className="settings-row-copy"><h3>{title}</h3><div className="settings-row-description">{description}</div></div>{children}</div>
}
export function SettingsSwitch({ title, description, checked, onChange, disabled = false }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return <div className="settings-row"><div className="settings-row-copy"><h3 id={id}>{title}</h3><p className="settings-row-description">{description}</p></div><button type="button" role="switch" aria-checked={checked} aria-labelledby={id} disabled={disabled} className="settings-switch" onClick={() => onChange(!checked)}><span /></button></div>
}
