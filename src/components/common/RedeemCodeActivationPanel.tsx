import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from '@/i18n/router'
import { redeemCoinCode, type RedeemWalletTarget } from '@/services/redeemCodeService'
import { isFeatureEnabled, listenFeatureFlagUpdates } from '@/services/featureFlagService'
import { toAppErrorMessage } from '@/services/errorMessageService'
import { buildInactiveFeatureMessage, showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import { toast } from '@/services/toastService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { REFUND_POLICY_PATH, STORE_RULES_PATH } from '@/lib/policyRoutes'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

export interface RedeemCodeFansubOption {
    id: string
    name: string
    coin_balance: number
}

interface RedeemCodeActivationPanelProps {
    currentUserId?: string
    fansubOptions?: RedeemCodeFansubOption[]
    title?: string
    description?: string
    variant?: 'default' | 'store'
    compact?: boolean
    className?: string
    onUserBalanceChange?: (nextBalance: number, creditedValue: number) => void
    onFansubBalanceChange?: (fansubId: string, nextBalance: number, creditedValue: number) => void
}

function RedeemCodeActivationPanel({
    currentUserId,
    fansubOptions = [],
    title = txa('Coin Kodu Aktifleştir'),
    description = txa('E-pin kodunu girerek coin bakiyeni anında yükle.'),
    variant = 'default',
    compact = false,
    className = '',
    onUserBalanceChange,
    onFansubBalanceChange,
}: RedeemCodeActivationPanelProps) {
    const [code, setCode] = useState('')
    const [target, setTarget] = useState<RedeemWalletTarget>('user')
    const [selectedFansubId, setSelectedFansubId] = useState<string>(fansubOptions[0]?.id || '')
    const [submitting, setSubmitting] = useState(false)
    const [featureEnabled, setFeatureEnabled] = useState(false)
    const [featureLoading, setFeatureLoading] = useState(true)
    const inactiveFeatureMessage = buildInactiveFeatureMessage(txa('Coin kodu aktivasyonu'))

    const hasFansubOptions = fansubOptions.length > 0

    useEffect(() => {
        if (!hasFansubOptions) {
            setTarget('user')
            setSelectedFansubId('')
            return
        }

        if (!selectedFansubId || !fansubOptions.some((item) => item.id === selectedFansubId)) {
            setSelectedFansubId(fansubOptions[0]?.id || '')
        }
    }, [fansubOptions, hasFansubOptions, selectedFansubId])

    useEffect(() => {
        let cancelled = false

        const loadFlag = async (forceRefresh = false) => {
            setFeatureLoading(true)
            const enabled = await isFeatureEnabled('economy.coin_codes', false, forceRefresh)
            if (!cancelled) {
                setFeatureEnabled(enabled)
                setFeatureLoading(false)
            }
        }

        void loadFlag()
        const unsubscribe = listenFeatureFlagUpdates((payload) => {
            if (payload.key !== 'economy.coin_codes') return
            void loadFlag(true)
        })

        return () => {
            cancelled = true
            unsubscribe()
        }
    }, [])

    const resolvedFansubName = useMemo(
        () => fansubOptions.find((item) => item.id === selectedFansubId)?.name || txa('Fansub'),
        [fansubOptions, selectedFansubId],
    )

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (submitting) return

        if (!currentUserId) {
            toast.warning(txa('Kod aktifleştirmek için giriş yapmalısın.'))
            return
        }

        if (!featureEnabled) {
            showInactiveFeatureToast(txa('Coin kodu aktivasyonu'))
            return
        }

        const normalizedCode = code.trim().toUpperCase()
        if (!normalizedCode) {
            toast.warning(txa('Lütfen bir kod gir.'))
            return
        }

        if (target === 'fansub' && !selectedFansubId) {
            toast.warning(txa('Lütfen bir fansub seç.'))
            return
        }

        setSubmitting(true)
        try {
            const result = await redeemCoinCode({
                userId: currentUserId,
                code: normalizedCode,
                target,
                fansubId: target === 'fansub' ? selectedFansubId : undefined,
            })

            if (result.targetType === 'user') {
                onUserBalanceChange?.(result.newBalance, result.creditedValue)
                toast.success(txa('Kod başarılı. +{v1} Coin yansıtıldı.', { v1: result.creditedValue.toLocaleString(intlLocale()) }))
            } else {
                const fansubId = result.fansubId || selectedFansubId
                onFansubBalanceChange?.(fansubId, result.newBalance, result.creditedValue)
                toast.success(txa('{v1} kasasına +{v2} Coin yansıtıldı.', { v1: resolvedFansubName, v2: result.creditedValue.toLocaleString(intlLocale()) }))
            }

            setCode('')
        } catch (error) {
            toast.error(toAppErrorMessage(error, txa('Kod aktifleştirme başarısız oldu.')))
        } finally {
            setSubmitting(false)
        }
    }

    const isDisabled = submitting || featureLoading || !featureEnabled

    return (
        <section className={cn(
            'flex flex-col gap-3 rounded-lg border border-border p-4',
            compact ? 'bg-card' : 'bg-muted/30',
            variant === 'store' && 'mt-0 rounded-xl border border-border bg-card/95 shadow-none',
            className,
        )}>
            {/* Başlık */}
            <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">{title}</h3>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>

            {/* Store teması: bilgi chip'leri */}
            {variant === 'store' && (
                <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="border-border bg-muted/60 text-[11px] text-muted-foreground">{txa('Anında bakiyeye yansır')}</Badge>
                    <Badge variant="outline" className="border-border bg-muted/60 text-[11px] text-muted-foreground">
                        {hasFansubOptions ? txa('Kişisel veya fansub kasası hedeflenebilir') : txa('Kişisel bakiyeye coin yükler')}
                    </Badge>
                </div>
            )}

            <div className="flex flex-wrap gap-3 text-xs leading-5 text-muted-foreground">
                <Link to={STORE_RULES_PATH} className="font-medium text-foreground transition-colors hover:text-primary">
                    {txa('Magaza ve Coin Kurallari')}
                </Link>
                <Link to={REFUND_POLICY_PATH} className="font-medium text-foreground transition-colors hover:text-primary">
                    {txa('Iade / Iptal / Dijital Teslim')}
                </Link>
            </div>

            {/* Özellik kapalı uyarısı */}
            {!featureLoading && !featureEnabled && (
                <div className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                    {inactiveFeatureMessage}
                </div>
            )}

            {/* Form */}
            <form className="flex flex-col gap-3" onSubmit={(event) => { void handleSubmit(event) }}>
                <Input
                    type="text"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder={txa('Örnek: BSG-ABC123-XYZ9')}
                    maxLength={64}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isDisabled}
                />

                {/* Hedef seçimi */}
                {hasFansubOptions && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
                        <label className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors',
                            target === 'user' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/50 text-foreground hover:bg-muted',
                        )}>
                            <input
                                type="radio"
                                name="redeem-target"
                                value="user"
                                checked={target === 'user'}
                                onChange={() => setTarget('user')}
                                disabled={isDisabled}
                                className="accent-primary"
                            />
                            {txa('Kişisel Bakiye')}
                        </label>
                        <label className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors',
                            target === 'fansub' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/50 text-foreground hover:bg-muted',
                        )}>
                            <input
                                type="radio"
                                name="redeem-target"
                                value="fansub"
                                checked={target === 'fansub'}
                                onChange={() => setTarget('fansub')}
                                disabled={isDisabled}
                                className="accent-primary"
                            />
                            {txa('Fansub Kasası')}
                        </label>
                    </div>
                )}

                {/* Fansub seçici */}
                {target === 'fansub' && hasFansubOptions && (
                    <div className="space-y-1">
                        <Label className="text-xs">{txa('Hedef Fansub')}</Label>
                        <select
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                            value={selectedFansubId}
                            onChange={(event) => setSelectedFansubId(event.target.value)}
                            disabled={isDisabled}
                        >
                            {fansubOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name} ({Number(item.coin_balance || 0).toLocaleString(intlLocale())} Coin)
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <Button type="submit" disabled={isDisabled} className="w-full">
                    {featureLoading ? txa('Kontrol ediliyor...') : submitting ? txa('Aktifleştiriliyor...') : featureEnabled ? txa('Kodu Aktifleştir') : txa('Şu Anda Aktif Değil')}
                </Button>
            </form>
        </section>
    )
}

export default RedeemCodeActivationPanel
