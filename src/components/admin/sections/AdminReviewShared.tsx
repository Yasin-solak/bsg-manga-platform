import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { AdminSurface } from '../shared/AdminSurface'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function ReviewStats({ items }: { items: { label: string; value: number | string; helper: string }[] }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{items.map(item => <AdminSurface key={item.label} className="p-4">
    <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
    <strong className="mt-1 block text-2xl font-semibold tabular-nums">{item.value.toLocaleString(intlLocale())}</strong>
    <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
  </AdminSurface>)}</div>
}

export function ReviewOwner({ username, id }: { username?: string | null; id: string }) {
  return <span className="block min-w-0">{username
    ? <Link className="font-medium text-primary hover:underline" to={`/profil/${encodeURIComponent(username)}`}>@{username}</Link>
    : <span className="text-muted-foreground">{txa('Kullanıcı adı bulunamadı')}</span>}
    <span className="mt-1 block break-all font-mono text-[11px] text-muted-foreground">{id}</span>
  </span>
}

export function ReviewEmpty({ children }: { children: ReactNode }) {
  return <div className="px-6 py-12 text-center text-sm text-muted-foreground" role="status">{children}</div>
}

export function ReviewReport({ value }: { value: unknown }) {
  return <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed">{JSON.stringify(value, null, 2)}</pre>
}
