import { useIsMobileViewport } from '@/hooks/useIsMobileViewport'
import { Outlet, useLocation } from 'react-router-dom'
import { Navigate } from '@/i18n/router'
import { PageTransition } from '@/components/layout/PageTransition'
import { useAuth } from '@/contexts/AuthContext'
import {
    EXPLORE_PATH,
    LEGACY_ONBOARDING_PATH,
    normalizeAppPath,
    ONBOARDING_PATH,
} from '@/lib/routes'
import { getE2EModeQueryParamEntry } from '@/testing/e2eMocks'
import { hasSeenGuestWelcome } from '@/lib/guestWelcome'

/** Yas kapisi rotasi; Layout hem yonlendirir hem kabugu atlar. */
const BIRTH_DATE_GATE_PATH = '/dogum-tarihi'
import { IstilaSpawner } from '@/components/murek/IstilaSpawner'
import AppSidebar from './AppSidebar'
import { MaintenanceGate } from './MaintenanceGate'
import { MobileTabBar } from './MobileTabBar'
import Footer from './Footer'
import { MobileTopBarOverrideProvider } from './MobileTopBarOverrideContext'
import { TopBarOverrideProvider } from './TopBarOverrideContext'
import { TopSearchBar } from './TopSearchBar'

function buildOnboardingRedirectPath(pathname: string, search: string, hash: string) {
    const redirectSearch = new URLSearchParams()
    const e2eEntry = getE2EModeQueryParamEntry()
    if (e2eEntry) {
        redirectSearch.set(e2eEntry[0], e2eEntry[1])
    }

    const returnTo = normalizeAppPath(`${pathname}${search}${hash}`)
    if (returnTo !== ONBOARDING_PATH && returnTo !== LEGACY_ONBOARDING_PATH) {
        redirectSearch.set('returnTo', returnTo)
    }

    const redirectQuery = redirectSearch.toString()
    return redirectQuery ? `${ONBOARDING_PATH}?${redirectQuery}` : ONBOARDING_PATH
}

/**
 * Where setup exits to.
 *
 * The fallback path is the HOME page. It used to be the profile (an empty profile is a dead end),
 * then Explore; but the user just picked genres and followed series, and
 * the payoff of that choice is on the HOME page: recommendations, follow feed and
 * "chapters waiting for you". Browsing the catalog is a separate wish.
 */
function buildOnboardingExitPath(search: string) {
    const params = new URLSearchParams(search)
    const returnTo = normalizeAppPath(params.get('returnTo') || '')
    const safeReturnTo = returnTo && returnTo.startsWith('/') && returnTo !== ONBOARDING_PATH && returnTo !== LEGACY_ONBOARDING_PATH
        ? returnTo
        : '/'

    const e2eEntry = getE2EModeQueryParamEntry()
    if (!e2eEntry) return safeReturnTo

    const [key, value] = e2eEntry
    const url = new URL(safeReturnTo, 'http://localhost')
    url.searchParams.set(key, value)
    return `${url.pathname}${url.search}${url.hash}`
}

function Layout() {
    const location = useLocation()
    const isMobile = useIsMobileViewport()
    const isNotificationsRoute = /^\/bildirimler(?:\/|$)/.test(location.pathname)
    const isExploreRoute = location.pathname.replace(/\/+$/, '') === EXPLORE_PATH
    const isCommunityWorkspace = location.pathname.replace(/\/+$/, '') === '/topluluk'
    const { currentUser, loading } = useAuth()
    // Reader v2 (/oku) also builds its own full-screen shell; rendered inside the app sidebar/topbar
    // it gets squeezed (reader/admin/studio follow the same pattern).
    const isMangaReader = location.pathname.includes('/chapter/')
        || location.pathname.includes('/bolum/')
        || location.pathname.startsWith('/oku/')
    const isAdminRoute = location.pathname.startsWith('/admin')
    // Ceviri Studyosu (/studyo) de kendi tam ekran kabugunu kurar.
    const isFansubStudioRoute = /^\/fansub\/[^/]+\/(?:yonet|studyo)(?:\/|$)/.test(location.pathname)
    const isOnboardingRoute = location.pathname === ONBOARDING_PATH || location.pathname === LEGACY_ONBOARDING_PATH
    /*
     * The sign-in funnel also builds its own full-screen shell. The welcome screen is
     * `min-h-screen` + its own background; rendered inside app chrome the bottom tab bar
     * overlapped the content (measured: the "Sign in" link stayed
     * 93px under the bar). The prototype has no bottom bar on Sign-in/Sign-up
     * screens either.
     */
    const isAuthRoute = location.pathname === '/giris'
    // Yas kapisi da kendi tam ekran kabugunu kurar.
    const isBirthDateGate = location.pathname === BIRTH_DATE_GATE_PATH
    const shouldUseChrome = !isMangaReader
        && !isAdminRoute
        && !isFansubStudioRoute
        && !isOnboardingRoute
        && !isAuthRoute
        && !isBirthDateGate
        && !isCommunityWorkspace
        && !(isMobile && isNotificationsRoute)
    const onboardingRedirectPath = buildOnboardingRedirectPath(location.pathname, location.search, location.hash)

    /*
     * Birth date is REQUIRED and the gate is here. Adding a field to the signup form only solves
     * new users; no existing user has a date and
     * social sign-in / email-verified signup open accounts without visiting the form.
     * Without asking for the date, 18+ content stays closed to EVERYONE and the gate is meaningless.
     *
     * It comes BEFORE onboarding: the genre and recommendation step must know
     * which series to show.
     */
    /*
     * PRODUCT RULE: a signed-out visitor opens the site on the WELCOME screen.
     *
     * Only the ROOT ROUTE is converted. Deep links (a shared series
     * address, search result, notification link) pass untouched: converting them all
     * to the welcome would send every shared link to a login wall and
     * devalue prerendered public routes.
     *
     * "Browse for now" leaves a flag; otherwise a visitor returning home is
     * sent to the welcome again, creating an infinite loop.
     */
    if (!loading && !currentUser && location.pathname === '/' && !hasSeenGuestWelcome()) {
        return <Navigate to="/giris?mod=karsilama" replace />
    }

    if (!loading && currentUser && !currentUser.birthDate && !isBirthDateGate) {
        return <Navigate to={BIRTH_DATE_GATE_PATH} replace />
    }

    /*
     * A user with a date DOES NOT STOP at the gate.
     *
     * Without this line saving WORKED but the screen stayed:
     * the RPC writes successfully, the context updates, the gate no longer redirects,
     * but nothing takes the user OUT of there. From outside it looked like
     * "the button does not work". (The onboarding exit path had the same class of
     * bug: one place sends, the other does not take back.)
     */
    if (!loading && currentUser?.birthDate && isBirthDateGate) {
        return <Navigate to={buildOnboardingExitPath(location.search)} replace />
    }

    if (!loading && currentUser && !currentUser.onboardingCompletedAt && !isOnboardingRoute) {
        return <Navigate to={onboardingRedirectPath} replace />
    }

    /*
     * A user who finished setup cannot return to onboarding: there is no reason
     * to see the flow again. The one exception is ADMIN PREVIEW:
     * `?onizleme=1`. Reviewing the screen used to require manually resetting
     * `onboarding_completed_at` in the database.
     */
    const isOnboardingPreview = isOnboardingRoute
        && currentUser?.role === 'admin'
        && new URLSearchParams(location.search).get('onizleme') === '1'

    if (!loading && currentUser?.onboardingCompletedAt && isOnboardingRoute && !isOnboardingPreview) {
        return <Navigate to={buildOnboardingExitPath(location.search)} replace />
    }

    // Reader, admin and fansub studio pages build their own shells.
    // The maintenance gate applies in this branch TOO: otherwise reader
    // routes would stay open in maintenance mode.
    if (!shouldUseChrome) {
        return (
            <MaintenanceGate>
                <Outlet />
            </MaintenanceGate>
        )
    }

    return (
        <MaintenanceGate>
        <TopBarOverrideProvider>
        <MobileTopBarOverrideProvider>
            <div className="min-h-screen bg-background">
                <AppSidebar hideMobileTopBar={isExploreRoute} />
                {/*
                    min-h-screen DEGIL: mobil ust cubuk `sticky` ve AKISTA yer
                    kapliyor (56px = h-14). Tam 100vh verilince sayfa her zaman
                    56px daha uzun oluyor, kisa sayfalarda footer alt cubugun
                    ALTINA giriyor ve yarisi gorunmez kaliyordu -- Kutuphane'de
                    olculdu: footer alti 784, cubuk ustu 731.
                    Masaustunde cubuk yok (lg:hidden), orada 100vh dogru.
                    Keşfet de 640px altında kendi başlığıyla açılır; genel
                    çubuk gizlendiğinde onun yüksekliği düşülmez.
                */}
                <div
                    id="layout-content"
                    className={isExploreRoute
                        ? 'flex min-h-screen flex-col sm:min-h-[calc(100svh_-_3.5rem)] lg:min-h-screen'
                        : 'flex min-h-[calc(100svh_-_3.5rem)] flex-col lg:min-h-screen'}
                >
                    <TopSearchBar />
                    <main className="min-h-0 flex-1">
                        <PageTransition>
                            <Outlet />
                        </PageTransition>
                    </main>
                    {/* Profil vitrini (prototip v3) tam ekran sahne + yapiskan sekmelerle biter: footer yok. */}
                    {location.pathname.startsWith('/profil/')
                        ? null
                        : (location.pathname === '/' || location.pathname === '/ayarlar') ? <div className="lg:hidden"><Footer /></div> : <Footer />}
                    {/* Sabit cubuk icerigin UZERINDE durur; bosluk birakilmazsa
                        sayfanin son satiri (ve footer baglantilari) cubugun
                        altinda kalip tiklanamaz olur.
                        calc() icinde `+` cevresinde BOSLUK sart; Tailwind'de `_`
                        ile yazilir. Bosluksuz hali gecersiz CSS -> yukseklik 0
                        -> footer cubugun altinda kalir (e2e bunu yakaladi). */}
                    <div aria-hidden="true" className="h-[calc(4.5rem_+_env(safe-area-inset-bottom))] lg:hidden" />
                </div>
                <MobileTabBar />
                {/* Murek Istilasi (Cadilar Bayrami etkinligi): yalniz kabuklu sayfalarda; okuyucu bolunmez. */}
                <IstilaSpawner />
                <style>{'@media(min-width:1024px){#layout-content{padding-left:15rem}}'}</style>
            </div>
        </MobileTopBarOverrideProvider>
        </TopBarOverrideProvider>
        </MaintenanceGate>
    )
}

export default Layout
