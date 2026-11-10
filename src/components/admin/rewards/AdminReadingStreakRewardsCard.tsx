import { useMemo, useState } from 'react'
import { Coins, Flame, Loader2, Plus, RefreshCw, Save } from 'lucide-react'
import type {
  AdminReadingStreakRewardClaim,
  AdminReadingStreakRewardRule,
  ReadingStreakRewardTriggerType,
} from '@/services/rewardService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateTime, formatNumber } from './adminRewardsUtils'
import { txa } from '@/i18n/activeLocale'

interface ReadingStreakRuleForm {
  slug: string
  title: string
  description: string
  triggerType: ReadingStreakRewardTriggerType
  targetValue: number
  coinReward: number
  sortOrder: number
}

interface AdminReadingStreakRewardsCardProps {
  loading: boolean
  error: string | null
  rules: AdminReadingStreakRewardRule[]
  claims: AdminReadingStreakRewardClaim[]
  savingId: string | null
  creating: boolean
  onUpdateRule: (ruleId: string, patch: Partial<AdminReadingStreakRewardRule>) => void
  onSaveRule: (rule: AdminReadingStreakRewardRule) => void
  onCreateRule: (form: ReadingStreakRuleForm) => void
  onReload: () => void
}

const TRIGGER_OPTIONS: Array<{ value: ReadingStreakRewardTriggerType; label: string; helper: string }> = [
  { value: 'daily_read', get label() { return txa('Günlük okuma') }, get helper() { return txa('Her gün 1 okuma') } },
  { value: 'streak_milestone', get label() { return txa('Seri eşiği') }, get helper() { return txa('Bir kez kazanilir') } },
  { value: 'weekly_active_days', get label() { return txa('Haftalık etkinlik') }, get helper() { return txa('Hafta bazli kazanilir') } },
]

const EMPTY_FORM: ReadingStreakRuleForm = {
  slug: '',
  title: '',
  description: '',
  triggerType: 'streak_milestone',
  targetValue: 3,
  coinReward: 50,
  sortOrder: 80,
}

export function AdminReadingStreakRewardsCard({
  loading,
  error,
  rules,
  claims,
  savingId,
  creating,
  onUpdateRule,
  onSaveRule,
  onCreateRule,
  onReload,
}: AdminReadingStreakRewardsCardProps) {
  const [form, setForm] = useState<ReadingStreakRuleForm>({ ...EMPTY_FORM })
  const activeRuleCount = useMemo(() => rules.filter((rule) => rule.isActive).length, [rules])

  function handleCreate() {
    if (!form.title.trim()) return
    onCreateRule(form)
    setForm({ ...EMPTY_FORM, sortOrder: form.sortOrder + 10 })
  }

  if (loading) {
    return (
      <Card className="rounded-xl border-border bg-card p-6">
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {txa('Okuma serisi odulleri yukleniyor...')}
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="rounded-xl border-border bg-card p-6">
        <p className="text-sm text-destructive">{error}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border-border bg-card p-5">
        <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 fill-primary text-primary" />
              <h2 className="text-lg font-bold text-foreground">{txa('Okuma serisi ödülleri')}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {txa('Günlük okuma, seri dönüm noktası ve haftalık etkinlik ödüllerini yönet.')}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onReload}>
            <RefreshCw className="h-3.5 w-3.5" />
            {txa('Yenile')}
          </Button>
        </div>

        <div className="mb-4 grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-[1fr_1fr_1.2fr_150px_130px_110px_auto]">
          <div>
            <Label className="text-xs">{txa('Başlık')}</Label>
            <Input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder={txa('14 günlük seri')}
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">{txa('Slug')}</Label>
            <Input
              value={form.slug}
              onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
              placeholder={txa('otomatik')}
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">{txa('Açıklama')}</Label>
            <Input
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder={txa('Ödül açıklaması')}
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">{txa('Tetikleyici')}</Label>
            <Select
              value={form.triggerType}
              onValueChange={(value) => setForm((prev) => ({
                ...prev,
                triggerType: value as ReadingStreakRewardTriggerType,
              }))}
            >
              <SelectTrigger size="sm" className="mt-1 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{txa('Hedef')}</Label>
            <Input
              type="number"
              min={1}
              value={form.targetValue}
              onChange={(event) => setForm((prev) => ({ ...prev, targetValue: Number(event.target.value) || 1 }))}
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">{txa('Coin')}</Label>
            <Input
              type="number"
              min={0}
              value={form.coinReward}
              onChange={(event) => setForm((prev) => ({ ...prev, coinReward: Number(event.target.value) || 0 }))}
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div className="flex items-end">
            <Button size="sm" className="gap-1.5 text-xs" disabled={creating || !form.title.trim()} onClick={handleCreate}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {txa('Ekle')}
            </Button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{formatNumber(rules.length)}{' '}{txa('kural')}</Badge>
          <Badge variant="secondary">{formatNumber(activeRuleCount)}{' '}{txa('aktif')}</Badge>
          <span>{txa('Kural sırası ana sayfa kartındaki bir sonraki ödül seçimini etkiler.')}</span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{txa('Ödül')}</TableHead>
              <TableHead>{txa('Tetikleyici')}</TableHead>
              <TableHead>{txa('Hedef')}</TableHead>
              <TableHead>{txa('Coin')}</TableHead>
              <TableHead>{txa('Sıra')}</TableHead>
              <TableHead>{txa('Durum')}</TableHead>
              <TableHead className="text-right">{txa('İşlem')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => {
              const isSaving = savingId === rule.id
              return (
                <TableRow key={rule.id} className={!rule.isActive ? 'opacity-60' : undefined}>
                  <TableCell className="min-w-[260px]">
                    <Input
                      value={rule.title}
                      onChange={(event) => onUpdateRule(rule.id, { title: event.target.value })}
                      className="h-8 text-xs font-semibold"
                    />
                    <Input
                      value={rule.description}
                      onChange={(event) => onUpdateRule(rule.id, { description: event.target.value })}
                      className="mt-2 h-8 text-xs"
                    />
                    <code className="mt-2 inline-block rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {rule.slug}
                    </code>
                  </TableCell>
                  <TableCell className="min-w-[170px]">
                    <Select
                      value={rule.triggerType}
                      onValueChange={(value) => onUpdateRule(rule.id, {
                        triggerType: value as ReadingStreakRewardTriggerType,
                      })}
                    >
                      <SelectTrigger size="sm" className="w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRIGGER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {TRIGGER_OPTIONS.find((option) => option.value === rule.triggerType)?.helper}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={rule.targetValue}
                      onChange={(event) => onUpdateRule(rule.id, { targetValue: Number(event.target.value) || 1 })}
                      className="h-8 w-20 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Coins className="h-3.5 w-3.5 text-amber-500" />
                      <Input
                        type="number"
                        min={0}
                        value={rule.coinReward}
                        onChange={(event) => onUpdateRule(rule.id, { coinReward: Number(event.target.value) || 0 })}
                        className="h-8 w-24 text-xs"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      value={rule.sortOrder}
                      onChange={(event) => onUpdateRule(rule.id, { sortOrder: Number(event.target.value) || 0 })}
                      className="h-8 w-20 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        size="sm"
                        checked={rule.isActive}
                        onCheckedChange={(checked) => onUpdateRule(rule.id, { isActive: checked })}
                      />
                      <span className="text-xs text-muted-foreground">{rule.isActive ? txa('Aktif') : txa('Pasif')}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" disabled={isSaving} onClick={() => onSaveRule(rule)}>
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="rounded-xl border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">{txa('Son kazanımlar')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {txa('Kim hangi seride ne kazandı, haftalık etkinliği ne durumda.')}
            </p>
          </div>
          <Badge variant="secondary">{txa('{v1} kayıt', { v1: formatNumber(claims.length) })}</Badge>
        </div>

        {claims.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            {txa('Henüz okuma serisi ödülü kazanılmadı.')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{txa('Kullanıcı')}</TableHead>
                <TableHead>{txa('Ödül')}</TableHead>
                <TableHead>{txa('Seri')}</TableHead>
                <TableHead>{txa('Hafta')}</TableHead>
                <TableHead>{txa('Coin')}</TableHead>
                <TableHead>{txa('Tarih')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell className="font-semibold">{claim.username}</TableCell>
                  <TableCell>
                    <div className="font-medium">{claim.ruleTitle}</div>
                    <div className="text-[10px] text-muted-foreground">{triggerLabel(claim.triggerType)}</div>
                  </TableCell>
                  <TableCell>{txa('{v1} gun', { v1: formatNumber(claim.streakDays) })}</TableCell>
                  <TableCell>{txa('{v1} aktif gun', { v1: formatNumber(claim.activeDaysThisWeek) })}</TableCell>
                  <TableCell className="font-bold text-amber-500">+{formatNumber(claim.creditedCoin)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(claim.claimedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

function triggerLabel(value: ReadingStreakRewardTriggerType) {
  return TRIGGER_OPTIONS.find((option) => option.value === value)?.label || value
}
