import { Navigate, useNavigate, useSearchParams } from '@/i18n/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageUp, Loader2, Sparkles, Tag, Trash2, UserRound, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ensureAuthenticatedClientState } from '@/services/authService'
import { toAppErrorMessage } from '@/services/errorMessageService'
import { updateMyPreferredGenres, userService } from '@/services/userService'
import { uploadUserAvatar } from '@/services/storageService'
import { toast } from '@/services/toastService'
import { LEGACY_ONBOARDING_PATH, normalizeAppPath, ONBOARDING_PATH } from '@/lib/routes'
import { getE2EModeQueryParamEntry, getE2EMockAuthUser } from '@/testing/e2eMocks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import OnboardingPreviewCard from '@/pages/onboarding/OnboardingPreviewCard'
import OnboardingStepRail from '@/pages/onboarding/OnboardingStepRail'
import OnboardingFansubsStep from '@/pages/onboarding/OnboardingFansubsStep'
import OnboardingWelcome from '@/pages/onboarding/OnboardingWelcome'
import OnboardingGenresStep, { MIN_GENRE_COUNT } from '@/pages/onboarding/OnboardingGenresStep'
import OnboardingRecommendationsStep from '@/pages/onboarding/OnboardingRecommendationsStep'
import { txa } from '@/i18n/activeLocale'

type OnboardingStepId = 'genres' | 'recommendations' | 'profile' | 'fansubs'

type OnboardingDraft = {
    avatarUrl: string
    bio: string
    genres: string[]
}

const ONBOARDING_STEPS: Array<{
    id: OnboardingStepId
    label: string
    title: string
    description: string
    icon: typeof Sparkles
}> = [
    {
        id: 'genres',
        get label() { return txa('Türler') },
        get title() { return txa('Ne okumayı seversin?') },
        get description() { return txa('Sana uygun serileri önerebilmemiz için sevdiğin türleri seç.') },
        icon: Tag,
    },
    {
        /*
         * The prototype's genre screen shows the PAYOFF of the choice right away. Onboarding used to
         * end with genre selection and the user picked three genres and moved on with
         * nothing.
         */
        id: 'recommendations',
        get label() { return txa('Öneriler') },
        get title() { return txa('Sana göre seriler') },
        get description() { return txa('Seçtiğin türlere göre çıkardık; takip ettiklerin kütüphanene düşer.') },
        icon: Sparkles,
    },
    {
        id: 'profile',
        get label() { return txa('Profil') },
        get title() { return txa('Profilini hazırla') },
        get description() { return txa('Avatar ve kısa biyografi ile ilk izlenimi netleştir (opsiyonel).') },
        icon: UserRound,
    },
    {
        id: 'fansubs',
        get label() { return txa('Fansublar') },
        get title() { return txa('Takip etmeye başla') },
        get description() { return txa('Birkaç ekip takip et; ana akışın ilk günden canlansın.') },
        icon: Users,
    },
]

const ONBOARDING_AVATAR_MAX_SIZE_MB = 2

function revokeBlobPreview(url: string | null) {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
    }
}

function validateAvatarFile(file: File) {
    if (!file.type.startsWith('image/')) {
        throw new Error(txa('Lutfen JPG, PNG, WEBP veya GIF formatinda bir gorsel secin.'))
    }

    const maxBytes = ONBOARDING_AVATAR_MAX_SIZE_MB * 1024 * 1024
    if (file.size > maxBytes) {
        throw new Error(txa('Avatar dosyasi {mb}MB limitini asamaz.', { mb: ONBOARDING_AVATAR_MAX_SIZE_MB }))
    }
}

function buildPathWithE2EQuery(path: string) {
    const e2eEntry = getE2EModeQueryParamEntry()
    if (!e2eEntry) return path

    const [key, value] = e2eEntry
    const url = new URL(path, 'http://localhost')
    url.searchParams.set(key, value)
    return `${url.pathname}${url.search}`
}

function resolveFinishPath(candidate: string | null) {
    const normalizedCandidate = normalizeAppPath(candidate || '')
    if (
        normalizedCandidate
        && normalizedCandidate.startsWith('/')
        && normalizedCandidate !== ONBOARDING_PATH
        && normalizedCandidate !== LEGACY_ONBOARDING_PATH
    ) {
        return buildPathWithE2EQuery(normalizedCandidate)
    }

    // The SAME place as Layout's exit path: two sources should not give two answers.
    return buildPathWithE2EQuery('/')
}

function OnboardingPage() {
    const { currentUser, loading, updateCurrentUser } = useAuth()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const avatarInputRef = useRef<HTMLInputElement | null>(null)
    const [activeStepIndex, setActiveStepIndex] = useState(0)
    /*
     * The welcome is a separate phase BEFORE the steps. It was not added as a fourth element to the
     * steps array: the progress bar and "Step n / 3" counter count
     * jobs to finish, and the welcome has none.
     */
    const [showWelcome, setShowWelcome] = useState(true)
    /*
     * Genres are saved WHEN MOVING to the recommendation step: `get_recommended_mangas`
     * reads the user's saved genre profile, so the choice must be written first.
     * Leaving it to the end would run the recommendation step with an empty profile.
     */
    const [genresSaved, setGenresSaved] = useState(false)
    const [draft, setDraft] = useState<OnboardingDraft>({
        avatarUrl: '',
        bio: '',
        genres: [],
    })
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
    const [followedFansubCount, setFollowedFansubCount] = useState(0)
    const [pageLoading, setPageLoading] = useState(true)
    const [pageError, setPageError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const activeStep = ONBOARDING_STEPS[activeStepIndex]
    const isLastStep = activeStepIndex === ONBOARDING_STEPS.length - 1
    const completionPercent = useMemo(
        () => Math.round(((activeStepIndex + 1) / ONBOARDING_STEPS.length) * 100),
        [activeStepIndex],
    )
    const finishPath = resolveFinishPath(searchParams.get('returnTo'))
    const e2eMockUser = getE2EMockAuthUser()
    const e2eMockUserId = e2eMockUser?.id || null
    const isE2EMockMode = e2eMockUserId != null
    const currentUserId = currentUser?.id || null
    const currentAuthUserId = currentUser?.authUserId || null
    const currentStorageOwnerId = currentAuthUserId || currentUserId
    const currentUserAvatar = currentUser?.avatar || ''

    useEffect(() => {
        return () => {
            revokeBlobPreview(avatarPreviewUrl)
        }
    }, [avatarPreviewUrl])

    useEffect(() => {
        let cancelled = false

        async function loadDraft() {
            if (!currentUserId) return

            setPageLoading(true)
            setPageError(null)

            try {
                if (isE2EMockMode) {
                    if (cancelled) return
                    setDraft({ avatarUrl: currentUserAvatar, bio: '', genres: [] })
                    return
                }

                const authReady = await ensureAuthenticatedClientState(currentAuthUserId)
                if (!authReady) {
                    if (!cancelled) {
                        setPageError(txa('Oturum hazirlanamadi. Sayfayi yenileyip tekrar dene.'))
                    }
                    return
                }

                const profile = await userService.getOwnProfileById(currentUserId)
                if (cancelled) return

                setDraft({
                    avatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : '',
                    bio: typeof profile.bio === 'string' ? profile.bio : '',
                    genres: [],
                })
            } catch (error) {
                console.error('[OnboardingPage] loadDraft error', error)
                if (!cancelled) {
                    setPageError(toAppErrorMessage(error, txa('Onboarding bilgileri yuklenemedi.')))
                }
            } finally {
                if (!cancelled) {
                    setPageLoading(false)
                }
            }
        }

        void loadDraft()

        return () => {
            cancelled = true
        }
    }, [currentUserAvatar, currentUserId, currentAuthUserId, isE2EMockMode])

    const handleFollowedCountChange = useCallback((count: number) => {
        setFollowedFansubCount(count)
    }, [])

    if (!loading && !currentUser) {
        return <Navigate to={buildPathWithE2EQuery('/giris')} replace />
    }

    if (loading || pageLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.16),transparent_28%),radial-gradient(circle_at_bottom_right,hsl(var(--secondary)/0.12),transparent_30%),hsl(var(--background))] px-6 py-10">
                <div className="rounded-3xl border border-border/70 bg-card/90 px-6 py-5 text-sm text-muted-foreground shadow-xl backdrop-blur">
                    {txa('Kurulum hazırlanıyor...')}
                </div>
            </div>
        )
    }

    if (!currentUser) {
        return null
    }

    const previewAvatar = avatarPreviewUrl || draft.avatarUrl.trim() || currentUser.avatar

    const handleNext = () => {
        setPageError(null)

        if (activeStep.id === 'genres') {
            // Same as the prototype: the recommendation list depends on genre selection.
            if (draft.genres.length < MIN_GENRE_COUNT) {
                setPageError(txa('Devam etmek için en az {count} tür seç.', { count: MIN_GENRE_COUNT }))
                return
            }
            /*
             * Genres are saved HERE, not at the end of setup:
             * `get_recommended_mangas` reads the user's saved genre profile.
             * Leaving it to the end would run the recommendation step with an empty profile.
             * Saving is best effort; on failure the flow continues and the recommendation engine
             * falls back to popular content.
             */
            if (!isE2EMockMode && currentUserId) {
                void updateMyPreferredGenres(currentUserId, draft.genres)
                    .catch(() => undefined)
                    .finally(() => setGenresSaved(true))
            } else {
                setGenresSaved(true)
            }
        }

        setActiveStepIndex((prev) => Math.min(prev + 1, ONBOARDING_STEPS.length - 1))
    }

    const handleBack = () => {
        setPageError(null)
        setActiveStepIndex((prev) => Math.max(prev - 1, 0))
    }

    const toggleGenre = (slug: string) => {
        setDraft((prev) => {
            const has = prev.genres.includes(slug)
            return {
                ...prev,
                genres: has ? prev.genres.filter((item) => item !== slug) : [...prev.genres, slug],
            }
        })
    }

    const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null
        if (!file) return

        try {
            validateAvatarFile(file)
            const previewUrl = URL.createObjectURL(file)
            revokeBlobPreview(avatarPreviewUrl)
            setAvatarFile(file)
            setAvatarPreviewUrl(previewUrl)
            setPageError(null)
        } catch (error) {
            event.target.value = ''
            setPageError(toAppErrorMessage(error, txa('Avatar dosyasi okunamadi.')))
        }
    }

    const clearAvatarSelection = () => {
        revokeBlobPreview(avatarPreviewUrl)
        setAvatarFile(null)
        setAvatarPreviewUrl(null)
        setPageError(null)
        if (avatarInputRef.current) {
            avatarInputRef.current.value = ''
        }
    }

    const completeOnboarding = async (skipSetup = false) => {
        if (!currentUser) return

        setSubmitting(true)
        setPageError(null)

        try {
            let normalizedAvatar = draft.avatarUrl.trim()
            const completedAt = new Date().toISOString()

            if (!e2eMockUser) {
                const authReady = await ensureAuthenticatedClientState(currentUser.authUserId)
                if (!authReady) {
                    throw new Error(txa('Oturum hazir degil. Lutfen bir kac saniye sonra tekrar deneyin.'))
                }
            }

            if (!e2eMockUser && !skipSetup) {
                if (avatarFile) {
                    normalizedAvatar = await uploadUserAvatar(avatarFile, currentStorageOwnerId || currentUser.id)
                }

                await userService.updateProfile(currentUser.id, {
                    bio: draft.bio.trim(),
                    avatar_url: normalizedAvatar || null,
                } as never)

                // Genre selection is best effort: updateMyPreferredGenres logs its own error;
                // if migration 20260627_254 is not applied we pass silently so as not to block
                // onboarding completion.
                if (draft.genres.length > 0) {
                    await updateMyPreferredGenres(currentUser.id, draft.genres).catch(() => undefined)
                }
            }

            const onboardingState = e2eMockUser
                ? { completedAt }
                : await userService.markOnboardingCompleted(currentUser.id, completedAt)

            const nextAvatarForContext = skipSetup
                ? currentUser.avatar
                : e2eMockUser
                    ? avatarPreviewUrl || normalizedAvatar || currentUser.avatar
                    : normalizedAvatar || currentUser.avatar

            updateCurrentUser({
                avatar: nextAvatarForContext,
                onboardingCompletedAt: onboardingState.completedAt || completedAt,
            })

            toast.success(skipSetup ? txa('Kurulum tamamlandı. Ayarları daha sonra da düzenleyebilirsin.') : txa('Hesabın hazır. Keşfe geçebilirsin.'))
            navigate(finishPath, { replace: true })
        } catch (error) {
            console.error('[OnboardingPage] completeOnboarding error', error)
            setPageError(toAppErrorMessage(error, txa('Onboarding kaydedilemedi. Lutfen tekrar dene.')))
        } finally {
            setSubmitting(false)
        }
    }

    if (showWelcome) {
        return (
            <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.16),transparent_28%),radial-gradient(circle_at_bottom_right,hsl(var(--secondary)/0.12),transparent_32%),hsl(var(--background))] px-5 py-8 lg:px-8">
                <OnboardingWelcome
                    avatar={previewAvatar}
                    displayName={currentUser.displayName || currentUser.username}
                    username={currentUser.username}
                    frameType={currentUser.frameType || 'default'}
                    steps={ONBOARDING_STEPS}
                    onStart={() => setShowWelcome(false)}
                    onSkip={() => { void completeOnboarding(true) }}
                    skipping={submitting}
                />
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.16),transparent_28%),radial-gradient(circle_at_bottom_right,hsl(var(--secondary)/0.12),transparent_32%),hsl(var(--background))] px-6 py-8 lg:px-8">
            <div className="mx-auto my-auto grid w-full max-w-[1380px] gap-6 lg:grid-cols-[280px_minmax(0,1fr)_220px] xl:grid-cols-[320px_minmax(0,1fr)_280px] xl:gap-8">
                <aside className="rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-xl backdrop-blur">
                    <div className="rounded-[24px] border border-primary/20 bg-[linear-gradient(150deg,hsl(var(--primary)/0.16),transparent_55%),linear-gradient(330deg,hsl(var(--secondary)/0.14),transparent_60%),hsl(var(--card))] p-5">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                            {txa('İlk kurulum')}
                        </div>
                        <h1 className="text-2xl font-black tracking-tight text-foreground">{txa('Hoş geldin, {name}', { name: currentUser.displayName || currentUser.username })}</h1>
                        <p className="mt-1 text-xs font-semibold text-primary">@{currentUser.username}</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {txa('Birkaç hızlı adımda zevkini tanıyalım, profilini kur ve akışını canlı ekiplerle doldur.')}
                        </p>
                    </div>

                    {activeStep.id === 'profile' ? (
                        <OnboardingPreviewCard
                            className="hidden lg:block"
                            username={currentUser.username}
                            displayName={currentUser.displayName || currentUser.username}
                            avatar={previewAvatar}
                            bio={draft.bio.trim()}
                            frameType={currentUser.frameType || 'default'}
                        />
                    ) : (
                        <div className="mt-5 hidden rounded-[24px] border border-border/70 bg-background/60 p-4 lg:block">
                            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{txa('Neden bu adım?')}</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                {activeStep.id === 'genres'
                                    ? txa('Seçtiğin türler Keşfet ve ana akışta sana daha isabetli öneriler getirir. İstediğin kadar seç; sonra değiştirebilirsin.')
                                    : txa('Takip ettiğin ekiplerin yeni bölümleri ana akışında ve bildirimlerinde belirir. Şimdi birkaç tane seç, gerisini sonra ekle.')}
                            </p>
                            {activeStep.id === 'genres' && draft.genres.length > 0 ? (
                                <p className="mt-3 text-xs font-bold text-primary">{txa('{count} tür seçildi', { count: draft.genres.length })}</p>
                            ) : null}
                            {activeStep.id === 'fansubs' && followedFansubCount > 0 ? (
                                <p className="mt-3 text-xs font-bold text-primary">{txa('{v1} ekip takip ediliyor', { v1: followedFansubCount })}</p>
                            ) : null}
                        </div>
                    )}
                </aside>

                <section className="rounded-[32px] border border-border/70 bg-card/95 p-5 shadow-xl backdrop-blur sm:p-6 lg:p-7">
                    <div className="flex flex-col gap-4 border-b border-border/70 pb-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-[0.24em] text-primary">
                                    {txa('Adım {current} / {total}', { current: activeStepIndex + 1, total: ONBOARDING_STEPS.length })}
                                </p>
                                <h2 className="mt-1 text-2xl font-black tracking-tight text-foreground">{txa(activeStep.title)}</h2>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                                    {txa(activeStep.description)}
                                </p>
                            </div>
                            <div className="min-w-[180px]">
                                <Progress value={completionPercent} />
                                <p className="mt-2 text-right text-xs text-muted-foreground">{txa('%{percent} tamamlandı', { percent: completionPercent })}</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6">
                        {activeStep.id === 'genres' ? (
                            <OnboardingGenresStep
                                selected={draft.genres}
                                onToggle={toggleGenre}
                                birthDate={currentUser.birthDate}
                            />
                        ) : null}

                        {activeStep.id === 'recommendations' ? (
                            <OnboardingRecommendationsStep
                                ready={genresSaved}
                                userId={currentUser.id}
                            />
                        ) : null}

                        {activeStep.id === 'profile' ? (
                            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                                <Card className="border-border/70 bg-background/70">
                                    <CardContent className="space-y-5 p-5">
                                        <div className="space-y-3">
                                            <Label htmlFor="onboarding-avatar-upload">{txa('Avatar yukle')}</Label>
                                            <input
                                                ref={avatarInputRef}
                                                id="onboarding-avatar-upload"
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp,image/gif"
                                                className="hidden"
                                                onChange={handleAvatarFileChange}
                                            />
                                            <div className="rounded-[26px] border border-dashed border-primary/30 bg-[linear-gradient(145deg,hsl(var(--primary)/0.08),transparent_70%),hsl(var(--background))] p-4">
                                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-foreground">
                                                            {avatarFile ? avatarFile.name : txa('Cihazindan avatar sec')}
                                                        </p>
                                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                            {txa('JPG, PNG, WEBP veya GIF. En fazla {v1}MB.', { v1: ONBOARDING_AVATAR_MAX_SIZE_MB })}
                                                        </p>
                                                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                                            {avatarFile
                                                                ? txa('Secilen dosya onboarding tamamlaninca avatars bucketina yuklenecek.')
                                                                : draft.avatarUrl.trim()
                                                                    ? txa('Yeni dosya secmezsen mevcut avatarin korunacak.')
                                                                    : txa('Avatar secmezsen mevcut avatarin korunur.')}
                                                        </p>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            onClick={() => avatarInputRef.current?.click()}
                                                            disabled={submitting}
                                                        >
                                                            <ImageUp className="mr-2 h-4 w-4" />
                                                            {txa('Dosya sec')}
                                                        </Button>
                                                        {avatarFile ? (
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                onClick={clearAvatarSelection}
                                                                disabled={submitting}
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                {txa('Temizle')}
                                                            </Button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="onboarding-bio">{txa('Kisa biyografi')}</Label>
                                            <Textarea
                                                id="onboarding-bio"
                                                placeholder={txa('Okuma zevkini veya profilde gorunsun istedigin kisa notu yaz.')}
                                                value={draft.bio}
                                                onChange={(event) => setDraft((prev) => ({ ...prev, bio: event.target.value.slice(0, 280) }))}
                                                className="min-h-36 resize-none"
                                            />
                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                <span>{txa('Profil kartinda ilk gorunen metinlerden biri olacak.')}</span>
                                                <span>{draft.bio.length}/280</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-border/70 bg-[linear-gradient(180deg,hsl(var(--primary)/0.1),transparent_45%),hsl(var(--background))]">
                                    <CardContent className="space-y-4 p-5">
                                        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{txa('Bu adimda ne oluyor?')}</p>
                                        <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                                            <li>{txa('Avatar dosyasi onboarding tamamlaninca storage icine yuklenir ve profiline kaydedilir.')}</li>
                                            <li>{txa('Bu adim tamamen opsiyonel; bos birakip devam edebilir, sonra duzenleyebilirsin.')}</li>
                                            <li>{txa('Solda profil kartinin canli onizlemesini gorursun.')}</li>
                                        </ul>
                                    </CardContent>
                                </Card>
                            </div>
                        ) : null}

                        {activeStep.id === 'fansubs' ? (
                            <OnboardingFansubsStep
                                userId={currentUser.id}
                                disabled={submitting}
                                e2eMock={isE2EMockMode}
                                onFollowedCountChange={handleFollowedCountChange}
                            />
                        ) : null}
                    </div>

                    {pageError ? (
                        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {pageError}
                        </div>
                    ) : null}

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleBack}
                            disabled={activeStepIndex === 0 || submitting}
                        >
                            {txa('Geri')}
                        </Button>

                        <div className="flex flex-wrap items-center gap-3">
                            {!isLastStep ? (
                                <Button type="button" onClick={handleNext} disabled={submitting}>
                                    {txa('Devam et')}
                                </Button>
                            ) : (
                                <Button type="button" onClick={() => void completeOnboarding(false)} disabled={submitting}>
                                    {submitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            {txa('Kaydediliyor...')}
                                        </>
                                    ) : txa('Kurulumu bitir')}
                                </Button>
                            )}
                        </div>
                    </div>
                </section>

                <OnboardingStepRail
                    activeStepId={activeStep.id}
                    activeStepIndex={activeStepIndex}
                    submitting={submitting}
                    onSelectStep={setActiveStepIndex}
                    onSkip={() => void completeOnboarding(true)}
                    steps={ONBOARDING_STEPS}
                />
            </div>
        </div>
    )
}

export default OnboardingPage
