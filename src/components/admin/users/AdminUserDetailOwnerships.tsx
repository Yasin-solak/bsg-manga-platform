import {
  Award,
  BadgeCheck,
  Crown,
  Frame,
  Image,
  Layers3,
  PackageOpen,
  Sparkles,
} from 'lucide-react'
import type { AdminUserDetail, AdminUserInventoryItem } from '@/services/adminUserService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Badge } from '@/components/ui/badge'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface AdminUserDetailOwnershipsProps {
  detail: AdminUserDetail
}

const OWNERSHIP_SECTIONS = [
  { key: 'frames', get title() { return txa('Çerçeveler') }, get description() { return txa('Avatar çerçevesi sahiplikleri') }, icon: Frame },
  { key: 'backgrounds', get title() { return txa('Arka Planlar') }, get description() { return txa('Profil arka planı sahiplikleri') }, icon: Image },
  { key: 'patterns', get title() { return txa('Desenler') }, get description() { return txa('Profil deseni sahiplikleri') }, icon: Layers3 },
  { key: 'badges', get title() { return txa('Rozet Referansları') }, get description() { return txa('Envantere bağlı rozet sahiplikleri') }, icon: Award },
  { key: 'premium', get title() { return txa('Premium Haklar') }, get description() { return txa('Premium ürün ve yetki sahiplikleri') }, icon: Crown },
] as const

const MAX_VISIBLE_OWNERSHIPS = 3
const MAX_VISIBLE_BADGES = 4

export function AdminUserDetailOwnerships({ detail }: AdminUserDetailOwnershipsProps) {
  const totalOwnerships = OWNERSHIP_SECTIONS.reduce(
    (total, section) => total + detail.inventory[section.key].length,
    0,
  )
  const displayedBadges = detail.badges
    .filter((badge) => badge.isDisplayed)
    .sort((left, right) => left.displayOrder - right.displayOrder)

  return (
    <div className="space-y-3" data-testid="admin-user-detail-ownerships">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <OwnershipMetric icon={PackageOpen} label={txa('Toplam sahiplik')} value={totalOwnerships} />
        {OWNERSHIP_SECTIONS.map((section) => (
          <OwnershipMetric
            key={section.key}
            icon={section.icon}
            label={section.title}
            value={detail.inventory[section.key].length}
          />
        ))}
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="grid gap-3 sm:grid-cols-2">
          {OWNERSHIP_SECTIONS.map((section) => (
            <InventorySection
              key={section.key}
              title={section.title}
              description={section.description}
              items={detail.inventory[section.key]}
              icon={section.icon}
            />
          ))}
        </div>

        <div className="space-y-3">
          <AdminSurface className="p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{txa('Kuşanılmış Çerçeve')}</h3>
                <p className="mt-1 break-all text-xs leading-5 text-muted-foreground">
                  {detail.profile.frameType || txa('Varsayılan çerçeve')}
                </p>
              </div>
            </div>
          </AdminSurface>

          <AdminSurface className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{txa('Gösterilen Rozetler')}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{txa('Profildeki görünür sıralama')}</p>
              </div>
              <Badge variant="outline">{displayedBadges.length}</Badge>
            </div>

            {displayedBadges.length === 0 ? (
              <EmptyOwnership text={txa('Gösterilen rozet bulunmuyor.')} />
            ) : (
              <ol className="mt-3 space-y-2">
                {displayedBadges.slice(0, MAX_VISIBLE_BADGES).map((badge) => (
                  <li key={badge.badgeId} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <BadgeCheck className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{badge.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{txa('Sıra {v1}', { v1: badge.displayOrder })}</p>
                    </div>
                  </li>
                ))}
                {displayedBadges.length > MAX_VISIBLE_BADGES ? (
                  <li className="text-center text-[10px] font-medium text-muted-foreground">
                    {txa('+{v1} ek rozet', { v1: displayedBadges.length - MAX_VISIBLE_BADGES })}
                  </li>
                ) : null}
              </ol>
            )}
          </AdminSurface>

          <AdminSurface className="border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-medium text-foreground">{txa('Veri kapsamı')}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {txa('Bu görünüm yalnızca kullanıcı envanterinde doğrulanan sahiplikleri gösterir; katalog erişimi sahiplik sayılmaz.')}
            </p>
          </AdminSurface>
        </div>
      </div>
    </div>
  )
}

function InventorySection({
  title,
  description,
  items,
  icon: Icon,
}: {
  title: string
  description: string
  items: AdminUserInventoryItem[]
  icon: typeof Frame
}) {
  return (
    <AdminSurface className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{description}</p>
          </div>
        </div>
        <Badge variant="secondary">{items.length}</Badge>
      </div>

      {items.length === 0 ? (
        <EmptyOwnership text={txa('Kayıtlı sahiplik yok.')} />
      ) : (
        <ul className="mt-3 grid gap-2">
          {items.slice(0, MAX_VISIBLE_OWNERSHIPS).map((item) => (
            <li key={`${item.type}-${item.ref}`} className="rounded-lg border border-border bg-muted/20 p-2.5">
              <p className="break-words text-xs font-medium text-foreground">{item.name}</p>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                {item.identifier ? <span>{txa('Kimlik: {v1}', { v1: item.identifier })}</span> : null}
                {item.storeItemId ? <span title={item.storeItemId}>{txa('Ürün: {v1}', { v1: item.storeItemId.slice(0, 8) })}</span> : null}
                {!item.identifier && !item.storeItemId ? <span>{txa('Referans: {v1}', { v1: item.ref })}</span> : null}
              </div>
            </li>
          ))}
          {items.length > MAX_VISIBLE_OWNERSHIPS ? (
            <li className="text-center text-[10px] font-medium text-muted-foreground">
              {txa('+{v1} ek sahiplik', { v1: items.length - MAX_VISIBLE_OWNERSHIPS })}
            </li>
          ) : null}
        </ul>
      )}
    </AdminSurface>
  )
}

function OwnershipMetric({ icon: Icon, label, value }: { icon: typeof Frame; label: string; value: number }) {
  return (
    <AdminSurface className="p-3">
      <Icon className="size-4 text-primary" aria-hidden="true" />
      <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{value.toLocaleString(intlLocale())}</p>
      <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{label}</p>
    </AdminSurface>
  )
}

function EmptyOwnership({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
      {text}
    </p>
  )
}
