import type { AdminUserRewardTask, RewardBadgeOption } from '@/services/rewardService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AdminOverflowMenu } from '@/components/admin/shared/AdminOverflowMenu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  METRIC_OPTIONS,
  type TaskMetricKey,
} from './adminRewardsUtils'
import { txa } from '@/i18n/activeLocale'

interface AdminRewardsUserTasksCardProps {
  taskLoading: boolean
  taskError: string | null
  taskRows: AdminUserRewardTask[]
  badgeOptions: RewardBadgeOption[]
  taskSavingId: string | null
  onUpdateTaskRow: (rowId: string, patch: Partial<AdminUserRewardTask>) => void
  onSaveTaskRow: (row: AdminUserRewardTask) => void
}

export function AdminRewardsUserTasksCard({
  taskLoading,
  taskError,
  taskRows,
  badgeOptions,
  taskSavingId,
  onUpdateTaskRow,
  onSaveTaskRow,
}: AdminRewardsUserTasksCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 border-b-2 border-border pb-2 text-lg font-bold text-foreground">
        {txa('Kullanici Gorev Konfigrasyonu')}
      </h2>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        {txa('Gorev ilerleme verisi `list_user_reward_tasks` RPC\'si ile anlik hesaplanir.')}
        {txa('Kaydetmeden sonra kullanici paneli yeni degerleri direkt gorur.')}
      </p>
      {taskLoading ? (
        <p className="text-sm text-muted-foreground">{txa('Görevler yükleniyor…')}</p>
      ) : taskError ? (
        <p className="text-sm text-muted-foreground">{taskError}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="divide-y divide-border">
                <th className="bg-muted/50 px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                  {txa('Slug')}
                </th>
                <th className="bg-muted/50 px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                  {txa('Baslik')}
                </th>
                <th className="bg-muted/50 px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                  {txa('Metrik')}
                </th>
                <th className="bg-muted/50 px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                  {txa('Hedef')}
                </th>
                <th className="bg-muted/50 px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                  {txa('Coin')}
                </th>
                <th className="bg-muted/50 px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                  {txa('Rozet')}
                </th>
                <th className="bg-muted/50 px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                  {txa('Sira')}
                </th>
                <th className="bg-muted/50 px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                  {txa('Durum')}
                </th>
                <th className="bg-muted/50 px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                  {txa('Islem')}
                </th>
              </tr>
            </thead>
            <tbody>
              {taskRows.map((row) => (
                <tr key={row.id} className="divide-y divide-border">
                  <td className="px-4 py-3">
                    <code className="rounded-md border border-border bg-black/5 px-1.5 py-0.5 text-xs">
                      {row.slug}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="text"
                      className="min-w-[100px] pl-2"
                      value={row.title}
                      onChange={(event) =>
                        onUpdateTaskRow(row.id, { title: event.target.value })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="min-h-9 min-w-[100px] rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      value={row.metricKey}
                      onChange={(event) =>
                        onUpdateTaskRow(row.id, {
                          metricKey: event.target.value as TaskMetricKey,
                        })
                      }
                    >
                      {METRIC_OPTIONS.map((metric) => (
                        <option key={metric.value} value={metric.value}>
                          {metric.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={1}
                      className="min-w-[100px] pl-2"
                      value={row.targetValue}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value || 1)
                        onUpdateTaskRow(row.id, { targetValue: Math.max(1, nextValue) })
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={0}
                      className="min-w-[100px] pl-2"
                      value={row.coinReward}
                      onChange={(event) => {
                        const nextCoin = Number(event.target.value || 0)
                        onUpdateTaskRow(row.id, { coinReward: Math.max(0, nextCoin) })
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="min-h-9 min-w-[100px] rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      value={row.badgeId || ''}
                      onChange={(event) => {
                        const nextBadge = event.target.value || null
                        const option = badgeOptions.find((item) => item.id === nextBadge)
                        onUpdateTaskRow(row.id, {
                          badgeId: nextBadge,
                          badgeName: option?.name || null,
                          badgeImageUrl: option?.imageUrl || null,
                        })
                      }}
                    >
                      <option value="">{txa('Rozet yok')}</option>
                      {badgeOptions.map((badge) => (
                        <option key={badge.id} value={badge.id}>
                          {badge.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={0}
                      className="min-w-[100px] pl-2"
                      value={row.sortOrder}
                      onChange={(event) => {
                        const nextSort = Number(event.target.value || 0)
                        onUpdateTaskRow(row.id, { sortOrder: Math.max(0, nextSort) })
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.isActive ? 'default' : 'secondary'}>
                      {row.isActive ? txa('Aktif') : txa('Pasif')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={taskSavingId === row.id}
                        onClick={() => onSaveTaskRow(row)}
                      >
                        {taskSavingId === row.id ? txa('Kaydediliyor…') : txa('Kaydet')}
                      </Button>
                      <AdminOverflowMenu size="sm" disabled={taskSavingId === row.id}>
                        <DropdownMenuItem
                          onClick={() =>
                            onUpdateTaskRow(row.id, { isActive: !row.isActive })
                          }
                        >
                          {row.isActive ? txa('Pasife al') : txa('Etkinleştir')}
                        </DropdownMenuItem>
                      </AdminOverflowMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
