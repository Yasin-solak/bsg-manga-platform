/**
 * AdminQuestManagementCard: quest CRUD card
 *
 * A shared list + create + edit + delete interface
 * for both user and fansub quests.
 * Supports tier grouping, ordering and dependency selection.
 */
import { useMemo, useState } from 'react'
import type { AdminUserRewardTask, RewardBadgeOption } from '@/services/rewardService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AdminOverflowMenu } from '@/components/admin/shared/AdminOverflowMenu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
    METRIC_OPTIONS,
    FANSUB_METRIC_OPTIONS,
    TIER_OPTIONS,
    tierColor,
    tierLabel,
} from './adminRewardsUtils'
import {
    Plus,
    Save,
    Trash2,
    Loader2,
    Star,
    Flame,
    Skull,
    ChevronDown,
    ChevronRight,
    ArrowUp,
    ArrowDown,
    ToggleLeft,
    ToggleRight,
    Copy,
    Link2,
    Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface NewQuestForm {
    slug: string
    title: string
    description: string
    metricKey: string
    targetValue: number
    coinReward: number
    tierLevel: number
    taskGroup: string
    unlockTaskId: string
}

const EMPTY_FORM: NewQuestForm = {
    slug: '',
    title: '',
    description: '',
    metricKey: '',
    targetValue: 1,
    coinReward: 50,
    tierLevel: 1,
    taskGroup: 'default',
    unlockTaskId: '',
}

function TierIcon({ level, className }: { level: number; className?: string }) {
    if (level === 3) return <Skull className={className} />
    if (level === 2) return <Flame className={className} />
    return <Star className={className} />
}

function sortQuestRows(a: AdminUserRewardTask, b: AdminUserRewardTask) {
    if (a.tierLevel !== b.tierLevel) return a.tierLevel - b.tierLevel
    if (a.taskGroup !== b.taskGroup) return a.taskGroup.localeCompare(b.taskGroup, 'tr')
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.title.localeCompare(b.title, 'tr')
}

function formatUnlockLabel(task: AdminUserRewardTask) {
    const parts = [task.taskGroup || 'default', `Tier ${task.tierLevel || 1}`, task.title]
    if (!task.isActive) parts.push('pasif')
    return parts.join(' | ')
}

function buildUnlockOptions(rows: AdminUserRewardTask[], currentRowId?: string) {
    return [...rows]
        .filter((row) => row.id !== currentRowId)
        .sort(sortQuestRows)
        .map((row) => ({
            value: row.id,
            label: formatUnlockLabel(row),
        }))
}

interface AdminQuestManagementCardProps {
    mode: 'user' | 'fansub'
    loading: boolean
    error: string | null
    rows: AdminUserRewardTask[]
    badgeOptions: RewardBadgeOption[]
    savingId: string | null
    onUpdateRow: (rowId: string, patch: Partial<AdminUserRewardTask>) => void
    onSaveRow: (row: AdminUserRewardTask) => void
    onCreateRow: (form: {
        slug: string
        title: string
        description: string
        metricKey: string
        targetValue: number
        coinReward: number
        tierLevel: number
        taskGroup: string
        unlockTaskId?: string | null
    }) => void
    onDeleteRow: (rowId: string) => void
    creating?: boolean
    presetLabel?: string
    presetLoading?: boolean
    onApplyPreset?: () => void
}

export function AdminQuestManagementCard({
    mode,
    loading,
    error,
    rows,
    badgeOptions,
    savingId,
    onUpdateRow,
    onSaveRow,
    onCreateRow,
    onDeleteRow,
    creating = false,
    presetLabel = txa('Hazir Preset'),
    presetLoading = false,
    onApplyPreset,
}: AdminQuestManagementCardProps) {
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [form, setForm] = useState<NewQuestForm>({ ...EMPTY_FORM })
    const [expandedTier, setExpandedTier] = useState<number | null>(1)

    const metricOptions = mode === 'fansub' ? FANSUB_METRIC_OPTIONS : METRIC_OPTIONS
    const sortedRows = useMemo(() => [...rows].sort(sortQuestRows), [rows])
    const createUnlockOptions = useMemo(() => buildUnlockOptions(sortedRows), [sortedRows])

    const grouped = TIER_OPTIONS.map((tier) => {
        const tierRows = sortedRows.filter((row) => (row.tierLevel ?? 1) === tier.value)
        const activeCount = tierRows.filter((row) => row.isActive).length
        return {
            ...tier,
            rows: tierRows,
            activeCount,
        }
    })

    function handleCreate() {
        if (!form.title.trim() || !form.metricKey) return
        const slug = form.slug.trim() || form.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
        onCreateRow({
            ...form,
            slug,
            unlockTaskId: form.unlockTaskId || null,
        })
        setForm({ ...EMPTY_FORM })
        setShowCreateForm(false)
    }

    function handleMoveUp(tierRows: AdminUserRewardTask[], index: number) {
        if (index === 0) return
        const current = tierRows[index]
        const above = tierRows[index - 1]
        const currentSort = current.sortOrder ?? index
        const aboveSort = above.sortOrder ?? (index - 1)
        onUpdateRow(current.id, { sortOrder: aboveSort })
        onUpdateRow(above.id, { sortOrder: currentSort })
        onSaveRow({ ...current, sortOrder: aboveSort })
        onSaveRow({ ...above, sortOrder: currentSort })
    }

    function handleMoveDown(tierRows: AdminUserRewardTask[], index: number) {
        if (index >= tierRows.length - 1) return
        const current = tierRows[index]
        const below = tierRows[index + 1]
        const currentSort = current.sortOrder ?? index
        const belowSort = below.sortOrder ?? (index + 1)
        onUpdateRow(current.id, { sortOrder: belowSort })
        onUpdateRow(below.id, { sortOrder: currentSort })
        onSaveRow({ ...current, sortOrder: belowSort })
        onSaveRow({ ...below, sortOrder: currentSort })
    }

    function handleBulkToggle(tierRows: AdminUserRewardTask[], setActive: boolean) {
        for (const row of tierRows) {
            if (row.isActive !== setActive) {
                onUpdateRow(row.id, { isActive: setActive })
                onSaveRow({ ...row, isActive: setActive })
            }
        }
    }

    if (loading) {
        return (
            <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{txa('Görevler yükleniyor…')}</span>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm text-destructive">{error}</p>
            </div>
        )
    }

    const totalActive = rows.filter((row) => row.isActive).length
    const totalInactive = rows.length - totalActive
    const totalCoinBudget = rows
        .filter((row) => row.isActive)
        .reduce((sum, row) => sum + (row.coinReward || 0), 0)

    return (
        <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">
                        {mode === 'fansub' ? txa('Fansub görevleri') : txa('Kullanıcı görevleri')}
                    </h3>
                    <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                        <span>{txa('{v1} görev', { v1: rows.length })}</span>
                        <span className="text-emerald-500">{totalActive}{' '}{txa('aktif')}</span>
                        {totalInactive > 0 && <span className="text-amber-500">{totalInactive}{' '}{txa('pasif')}</span>}
                        <span>{txa('Toplam butce: {v1} coin', { v1: totalCoinBudget.toLocaleString(intlLocale()) })}</span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {onApplyPreset && mode === 'user' && (
                        <Button
                            size="sm"
                            variant="secondary"
                            className="gap-1.5 text-xs"
                            disabled={presetLoading || creating}
                            onClick={onApplyPreset}
                        >
                            {presetLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            {presetLabel}
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs"
                        onClick={() => setShowCreateForm((value) => !value)}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        {txa('Yeni görev')}
                    </Button>
                </div>
            </div>

            {showCreateForm && (
                <div className="border-b border-border bg-muted/30 p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <Label className="text-xs">{txa('Başlık')}</Label>
                            <Input
                                value={form.title}
                                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                                placeholder={txa('Görev adı')}
                                className="mt-1 h-8 text-xs"
                            />
                        </div>
                        <div>
                            <Label className="text-xs">{txa('Slug (opsiyonel)')}</Label>
                            <Input
                                value={form.slug}
                                onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                                placeholder={txa('otomatik')}
                                className="mt-1 h-8 text-xs"
                            />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-2">
                            <Label className="text-xs">{txa('Açıklama')}</Label>
                            <Input
                                value={form.description}
                                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                                placeholder={txa('Görev açıklaması')}
                                className="mt-1 h-8 text-xs"
                            />
                        </div>
                        <div>
                            <Label className="text-xs">{txa('Metrik')}</Label>
                            <select
                                value={form.metricKey}
                                onChange={(e) => setForm((prev) => ({ ...prev, metricKey: e.target.value }))}
                                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                            >
                                <option value="">{txa('Seç…')}</option>
                                {metricOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label className="text-xs">{txa('Hedef değer')}</Label>
                            <Input
                                type="number"
                                min={1}
                                value={form.targetValue}
                                onChange={(e) => setForm((prev) => ({ ...prev, targetValue: Number(e.target.value) || 1 }))}
                                className="mt-1 h-8 text-xs"
                            />
                        </div>
                        <div>
                            <Label className="text-xs">{txa('Coin ödülü')}</Label>
                            <Input
                                type="number"
                                min={0}
                                value={form.coinReward}
                                onChange={(e) => setForm((prev) => ({ ...prev, coinReward: Number(e.target.value) || 0 }))}
                                className="mt-1 h-8 text-xs"
                            />
                        </div>
                        <div>
                            <Label className="text-xs">{txa('Tier')}</Label>
                            <select
                                value={form.tierLevel}
                                onChange={(e) => setForm((prev) => ({ ...prev, tierLevel: Number(e.target.value) || 1 }))}
                                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                            >
                                {TIER_OPTIONS.map((tier) => (
                                    <option key={tier.value} value={tier.value}>{tier.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label className="text-xs">{txa('Grup')}</Label>
                            <Input
                                value={form.taskGroup}
                                onChange={(e) => setForm((prev) => ({ ...prev, taskGroup: e.target.value }))}
                                placeholder="default"
                                className="mt-1 h-8 text-xs"
                            />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-2">
                            <Label className="text-xs">{txa('Bagimlilik')}</Label>
                            <select
                                value={form.unlockTaskId}
                                onChange={(e) => setForm((prev) => ({ ...prev, unlockTaskId: e.target.value }))}
                                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                            >
                                <option value="">{txa('Kilit yok')}</option>
                                {createUnlockOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <Button
                                size="sm"
                                className="gap-1.5 text-xs"
                                disabled={creating || !form.title.trim() || !form.metricKey}
                                onClick={handleCreate}
                            >
                                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                {txa('Olustur')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="divide-y divide-border">
                {grouped.map((group) => (
                    <div key={group.value}>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setExpandedTier(expandedTier === group.value ? null : group.value)}
                                className="flex flex-1 items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                            >
                                {expandedTier === group.value ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <TierIcon level={group.value} className={`h-4 w-4 ${group.color}`} />
                                <span className="text-sm font-medium">{group.label}</span>
                                <Badge variant="secondary" className="text-[10px]">
                                    {group.rows.length}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">{txa('({v1} aktif)', { v1: group.activeCount })}</span>
                            </button>

                            {expandedTier === group.value && group.rows.length > 0 && (
                                <div className="flex items-center gap-1 pr-3">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 gap-1 px-2 text-[10px]"
                                        title={txa('Tümünü etkinleştir')}
                                        onClick={() => handleBulkToggle(group.rows, true)}
                                    >
                                        <ToggleRight className="h-3 w-3 text-emerald-500" />
                                        {txa('Hepsini Aktif')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 gap-1 px-2 text-[10px]"
                                        title={txa('Tümünü pasife al')}
                                        onClick={() => handleBulkToggle(group.rows, false)}
                                    >
                                        <ToggleLeft className="h-3 w-3 text-amber-500" />
                                        {txa('Hepsini Pasif')}
                                    </Button>
                                </div>
                            )}
                        </div>

                        {expandedTier === group.value && group.rows.length > 0 && (
                            <div className="divide-y divide-border/50 bg-muted/10">
                                {group.rows.map((row, index) => (
                                    <QuestRowEditor
                                        key={row.id}
                                        row={row}
                                        index={index}
                                        totalInTier={group.rows.length}
                                        allRows={sortedRows}
                                        metricOptions={metricOptions}
                                        badgeOptions={badgeOptions}
                                        savingId={savingId}
                                        onUpdate={onUpdateRow}
                                        onSave={onSaveRow}
                                        onDelete={onDeleteRow}
                                        onMoveUp={() => handleMoveUp(group.rows, index)}
                                        onMoveDown={() => handleMoveDown(group.rows, index)}
                                    />
                                ))}
                            </div>
                        )}

                        {expandedTier === group.value && group.rows.length === 0 && (
                            <p className="px-4 py-3 text-xs text-muted-foreground">
                                {txa('Bu kademede henüz görev yok.')}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function QuestRowEditor({
    row,
    index,
    totalInTier,
    allRows,
    metricOptions,
    badgeOptions,
    savingId,
    onUpdate,
    onSave,
    onDelete,
    onMoveUp,
    onMoveDown,
}: {
    row: AdminUserRewardTask
    index: number
    totalInTier: number
    allRows: AdminUserRewardTask[]
    metricOptions: Array<{ value: string; label: string }>
    badgeOptions: RewardBadgeOption[]
    savingId: string | null
    onUpdate: (rowId: string, patch: Partial<AdminUserRewardTask>) => void
    onSave: (row: AdminUserRewardTask) => void
    onDelete: (rowId: string) => void
    onMoveUp: () => void
    onMoveDown: () => void
}) {
    const isSaving = savingId === row.id
    const unlockOptions = useMemo(() => buildUnlockOptions(allRows, row.id), [allRows, row.id])
    const unlockTask = row.unlockTaskId ? allRows.find((item) => item.id === row.unlockTaskId) || null : null

    return (
        <div className={cn('px-4 py-3', !row.isActive && 'opacity-60')}>
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col gap-0.5">
                    <button
                        type="button"
                        onClick={onMoveUp}
                        disabled={index === 0}
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-30"
                        title={txa('Yukari tasi')}
                    >
                        <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                        type="button"
                        onClick={onMoveDown}
                        disabled={index >= totalInTier - 1}
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-30"
                        title={txa('Asagi tasi')}
                    >
                        <ArrowDown className="h-3 w-3" />
                    </button>
                </div>

                <span className="w-5 text-center text-[10px] font-medium text-muted-foreground">#{index + 1}</span>

                <Input
                    value={row.title}
                    onChange={(e) => onUpdate(row.id, { title: e.target.value })}
                    className="h-7 w-36 text-xs font-medium lg:w-44"
                />

                <select
                    value={row.metricKey}
                    onChange={(e) => onUpdate(row.id, { metricKey: e.target.value })}
                    className="h-7 max-w-[220px] rounded-md border border-input bg-background px-1.5 text-[11px]"
                >
                    {metricOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>

                <Input
                    type="number"
                    min={1}
                    value={row.targetValue}
                    onChange={(e) => onUpdate(row.id, { targetValue: Number(e.target.value) || 1 })}
                    className="h-7 w-16 text-xs"
                    title={txa('Hedef değer')}
                />

                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-amber-500">C</span>
                    <Input
                        type="number"
                        min={0}
                        value={row.coinReward}
                        onChange={(e) => onUpdate(row.id, { coinReward: Number(e.target.value) || 0 })}
                        className="h-7 w-16 text-xs"
                        title={txa('Coin ödülü')}
                    />
                </div>

                <select
                    value={row.badgeId || ''}
                    onChange={(e) => onUpdate(row.id, { badgeId: e.target.value || null })}
                    className="h-7 max-w-[140px] rounded-md border border-input bg-background px-1.5 text-[11px]"
                    title={txa('Rozet')}
                >
                    <option value="">{txa('Rozet yok')}</option>
                    {badgeOptions.map((badge) => (
                        <option key={badge.id} value={badge.id}>{badge.name}</option>
                    ))}
                </select>

                <Badge
                    variant={row.isActive ? 'default' : 'secondary'}
                    className="cursor-pointer select-none text-[10px]"
                    onClick={() => onUpdate(row.id, { isActive: !row.isActive })}
                >
                    {row.isActive ? txa('Aktif') : txa('Pasif')}
                </Badge>

                <div className="ml-auto flex items-center gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-xs"
                        disabled={isSaving}
                        onClick={() => onSave(row)}
                        title={txa('Kaydet')}
                    >
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    </Button>
                    <AdminOverflowMenu>
                        <DropdownMenuItem
                            onClick={() => {
                                const info = [
                                    row.title,
                                    row.metricKey,
                                    txa('Hedef: {v1}', { v1: row.targetValue }),
                                    `Coin: ${row.coinReward}`,
                                    `Tier: ${tierLabel(row.tierLevel ?? 1)}`,
                                    `Grup: ${row.taskGroup || 'default'}`,
                                    `Bagimlilik: ${unlockTask ? unlockTask.title : txa('Yok')}`,
                                ].join(' | ')
                                void navigator.clipboard.writeText(info)
                            }}
                        >
                            <Copy className="mr-2 h-3.5 w-3.5" />
                            {txa('Bilgi Kopyala')}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => onDelete(row.id)}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            {txa('Sil')}
                        </DropdownMenuItem>
                    </AdminOverflowMenu>
                </div>
            </div>

            <div className="mt-3 grid gap-2 pl-9 md:grid-cols-2 xl:grid-cols-[minmax(0,1.8fr)_150px_150px_minmax(0,1.6fr)]">
                <div>
                    <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{txa('Açıklama')}</Label>
                    <Input
                        value={row.description}
                        onChange={(e) => onUpdate(row.id, { description: e.target.value })}
                        className="mt-1 h-7 text-xs"
                    />
                </div>
                <div>
                    <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{txa('Grup')}</Label>
                    <Input
                        value={row.taskGroup || 'default'}
                        onChange={(e) => onUpdate(row.id, { taskGroup: e.target.value })}
                        className="mt-1 h-7 text-xs"
                    />
                </div>
                <div>
                    <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{txa('Tier')}</Label>
                    <select
                        value={row.tierLevel || 1}
                        onChange={(e) => onUpdate(row.id, { tierLevel: Number(e.target.value) || 1 })}
                        className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                        {TIER_OPTIONS.map((tier) => (
                            <option key={tier.value} value={tier.value}>{tier.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <Label className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        <Link2 className="h-3 w-3" />
                        {txa('Bagimlilik')}
                    </Label>
                    <select
                        value={row.unlockTaskId || ''}
                        onChange={(e) => onUpdate(row.id, { unlockTaskId: e.target.value || null })}
                        className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                        <option value="">{txa('Kilit yok')}</option>
                        {unlockOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 pl-9 text-[11px] text-muted-foreground">
                <code className="rounded border border-border bg-background px-1.5 py-0.5">{row.slug}</code>
                <Badge className={`text-[10px] ${tierColor(row.tierLevel ?? 1)}`}>
                    <TierIcon level={row.tierLevel ?? 1} className="mr-0.5 h-3 w-3" />
                    {tierLabel(row.tierLevel ?? 1)}
                </Badge>
                <span>{txa('Grup: {v1}', { v1: row.taskGroup || 'default' })}</span>
                <span>{txa('Bagimlilik: {v1}', { v1: unlockTask ? unlockTask.title : txa('Yok') })}</span>
            </div>
        </div>
    )
}


