import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Navigate, useNavigate } from '@/i18n/router'
import { ArrowLeft, Check, Eye, EyeOff, Loader2, ShieldCheck, X } from 'lucide-react'
import AuthWelcome from '@/pages/auth/AuthWelcome'
import { PROVIDER_SHORT_LABELS, ProviderGlyph } from '@/pages/auth/authProviderVisuals'
import AuthLastAccountCard from '@/pages/auth/AuthLastAccountCard'
import AuthPasswordFeedback from '@/pages/auth/AuthPasswordFeedback'
import AuthSignupProgress from '@/pages/auth/AuthSignupProgress'
import {
  listEnabledOAuthProviders,
  signInWithOAuthProvider,
  type OAuthProviderDefinition,
} from '@/services/oauthProviders'
import { markGuestWelcomeSeen } from '@/lib/guestWelcome'
import {
  forgetLastAccount,
  readLastAccount,
  rememberLastAccount,
  type LastAccount,
} from '@/lib/lastAccount'
import { useAuth } from '@/contexts/AuthContext'
import { normalizeUsernameInput, signUpWithEmail, validateUsernameInput } from '@/services/authService'
import { toAppErrorMessage } from '@/services/errorMessageService'
import { checkLeakedPassword } from '@/services/leakedPasswordService'
import { getPreferredAuthPersistenceMode } from '@/services/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH, passwordProblemMessage } from '@/lib/passwordPolicy'
import { checkBirthDate } from '@/lib/birthDate'
import { measurePasswordStrength } from '@/lib/passwordStrength'
import {
  checkUsernameAvailability,
  suggestUsernames,
  type UsernameAvailability,
} from '@/services/usernameAvailabilityService'
import { setMyBirthDate } from '@/services/birthDateService'
import { cn } from '@/lib/utils'
import { KVKK_PATH, PRIVACY_PATH, TERMS_PATH } from '@/lib/policyRoutes'
import { normalizeAppPath } from '@/lib/routes'
import { useLocale, useTx } from '@/i18n/LocaleProvider'
import { localizeHref } from '@/i18n/localizedRoutes'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * `welcome` is the prototype's WELCOME screen and now the default state.
 *
 * `/giris` used to open straight to the form: the visitor was first asked for email and
 * password, and nowhere told WHY to open an account.
 * The welcome states the promise first, then asks the path.
 *
 * The address bar can enter the form directly with `?mod=giris` / `?mod=kayit`;
 * in-app "Sign in" links work this way without skipping the form.
 */
/** Format check before submit; real validation is still on the server. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type Mode = 'welcome' | 'login' | 'register'

function readInitialMode(search: string): Mode {
  const value = new URLSearchParams(search).get('mod')
  if (value === 'giris') return 'login'
  if (value === 'kayit') return 'register'
  if (value === 'karsilama') return 'welcome'
  /*
   * Default FORM.
   *
   * The welcome shows WHEN OPENING THE SITE (Layout takes a signed-out visitor from the
   * root route here with `?mod=karsilama`). The ~8 in-app
   * "Sign in" links want the form directly: sending someone who said sign in through
   * an intro screen first is an extra tap.
   */
  return 'login'
}

function AuthPage() {
  const tx = useTx()
  const { locale } = useLocale()
  const initialSearch = typeof window === 'undefined' ? '' : window.location.search
  const [mode, setMode] = useState<Mode>(() => readInitialMode(initialSearch))
  /*
   * The remembered account's email is PREFILLED: the card's job is to say "back in two
   * seconds". A reminder only; the password is still asked.
   */
  const [email, setEmail] = useState(() => readLastAccount()?.email ?? '')
  const [password, setPassword] = useState('')
  const [passwordAgain, setPasswordAgain] = useState('')
  const [username, setUsername] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [usernameState, setUsernameState] = useState<UsernameAvailability | 'checking'>('unknown')
  const [mfaCode, setMfaCode] = useState('')
  const [rememberAcrossBrowserRestart, setRememberAcrossBrowserRestart] = useState(
    () => getPreferredAuthPersistenceMode() === 'local',
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    cancelPendingMfa,
    currentUser,
    pendingMfa,
    signIn,
    verifyMfa,
  } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const redirectAfterAuth = useMemo(() => {
    const fromState = typeof (location.state as { from?: unknown } | null)?.from === 'string'
      ? (location.state as { from: string }).from
      : ''
    const normalizedFrom = normalizeAppPath(fromState)
    const safeFrom = normalizedFrom.startsWith('/') && normalizedFrom !== '/giris' ? normalizedFrom : ''
    return safeFrom || (currentUser ? `/profil/${encodeURIComponent(currentUser.username)}` : '/')
  }, [currentUser, location.state])

  const isLogin = mode === 'login'
  const [providers, setProviders] = useState<OAuthProviderDefinition[]>([])
  const [oauthBusy, setOauthBusy] = useState(false)
  const [passwordShown, setPasswordShown] = useState(false)
  const [lastAccount, setLastAccount] = useState<LastAccount | null>(() => readLastAccount())
  const [termsAccepted, setTermsAccepted] = useState(false)

  /*
   * Provider buttons come from the SAME source as the Welcome: an uninstalled
   * provider's button is never drawn. Two lists on two screens meant
   * a button visible on one and not the other.
   */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const enabled = await listEnabledOAuthProviders()
      if (!cancelled) setProviders(enabled)
    })()
    return () => { cancelled = true }
  }, [])

  const handleProvider = async (provider: OAuthProviderDefinition) => {
    setOauthBusy(true)
    try {
      await signInWithOAuthProvider(provider.id)
    } catch (providerError) {
      setError(toAppErrorMessage(providerError, txa('Giriş başlatılamadı. Lütfen tekrar dene.')))
      setOauthBusy(false)
    }
  }
  /*
   * Availability is checked LIVE (prototype screen 3). It used to be known only AFTER
   * SUBMITTING: the user filled the form, got "this handle is taken"
   * and started over.
   *
   * Delay: a query per keystroke is a needless load. The request can be cancelled,
   * so an old answer cannot overwrite new input.
   */
  useEffect(() => {
    if (isLogin) return
    const normalized = normalizeUsernameInput(username)
    if (validateUsernameInput(normalized)) {
      setUsernameState('unknown')
      return
    }

    const controller = new AbortController()
    setUsernameState('checking')
    const timer = window.setTimeout(() => {
      void checkUsernameAvailability(normalized, controller.signal).then((result) => {
        if (!controller.signal.aborted) setUsernameState(result)
      })
    }, 400)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [isLogin, username])

  /*
   * Rules derive from the POLICY itself (checkPasswordPolicy). A separate
   * list meant two sources: a rule could pass in one and
   * stay in the other.
   */
  const passwordRules = useMemo(() => {
    const problems = new Set(checkPasswordPolicy({
      password,
      username: normalizeUsernameInput(username),
      email,
    }))
    return [
      { id: 'uzunluk', label: tx('En az {count} karakter', { count: MIN_PASSWORD_LENGTH }), ok: !problems.has('cok_kisa') && password.length > 0 },
      { id: 'tekrar', label: tx('Tek karakterin tekrarı değil'), ok: !problems.has('tek_karakter') && password.length > 0 },
      { id: 'kimlik', label: tx('Kullanıcı adını/e-postanı içermiyor'), ok: !problems.has('kimlik_iceriyor') && password.length > 0 },
    ]
  }, [email, password, tx, username])

  const passwordStrength = useMemo(
    () => measurePasswordStrength({
      password,
      username: normalizeUsernameInput(username),
      email,
    }),
    [email, password, username],
  )

  if (currentUser) {
    return <Navigate to={redirectAfterAuth} replace />
  }

  const isMfaStep = pendingMfa != null

  const validate = () => {
    if (isMfaStep) {
      if (!/^\d{6}$/.test(mfaCode.replace(/\s+/g, '').trim())) {
        setError(tx('Lütfen 6 haneli 2FA kodunu girin.'))
        return false
      }
      return true
    }

    if (!email.trim() || !password.trim()) {
      setError(tx('E-posta ve şifre zorunludur.'))
      return false
    }

    if (!isLogin) {
      const normalizedUsername = normalizeUsernameInput(username)
      const usernameError = validateUsernameInput(normalizedUsername)
      if (usernameError) {
        setError(tx(usernameError))
        return false
      }

      const policyProblems = checkPasswordPolicy({ password, username: normalizedUsername, email })
      if (policyProblems.length > 0) {
        setError(policyProblems.map((problem) => tx(passwordProblemMessage(problem))).join(' '))
        return false
      }

      if (password !== passwordAgain) {
        setError(tx('Şifreler eşleşmiyor.'))
        return false
      }

      /*
       * Birth date is REQUIRED: the 18+ gate (mangas/chapters RLS) depends on this field and
       * while it is empty the user can never see that content.
       * A checkbox ("I am over 13") does not cover this: the real age is needed.
       * The same rules exist on the server; this is early feedback.
       */
      const birthCheck = checkBirthDate(birthDate)
      if (!birthCheck.valid) {
        setError(tx(birthCheck.message || txa('Doğum tarihi zorunlu.')))
        return false
      }

      if (!EMAIL_PATTERN.test(email.trim())) {
        setError(tx('Geçerli bir e-posta gir.'))
        return false
      }

      /*
       * The checkbox is `required` in HTML but the submit check is also needed:
       * `required` relies only on the browser's form validation and
       * can be skipped on programmatic submit.
       */
      if (!termsAccepted) {
        setError(tx("Devam etmek için Kullanım Koşulları ve Gizlilik Politikası'nı kabul etmelisin."))
        return false
      }
    }

    return true
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!validate()) return

    try {
      setSubmitting(true)

      if (isMfaStep) {
        await verifyMfa(mfaCode)
        setMfaCode('')
        navigate(redirectAfterAuth, { replace: true })
        return
      }

      if (isLogin) {
        await signIn(email.trim(), password, {
          persistAcrossBrowserRestart: rememberAcrossBrowserRestart,
        })
        /*
         * The account is remembered ONLY if the user wanted to be remembered on this device.
         * Otherwise on a shared device the next person would see someone else's
         * email. What is stored is NOT A TOKEN: stealing it gives no account
         * access, it only recalls who is returning.
         */
        if (rememberAcrossBrowserRestart) {
          rememberLastAccount({
            username: email.trim(),
            displayName: email.trim(),
            avatar: '',
            email: email.trim(),
          })
        } else {
          forgetLastAccount()
        }
        setPassword('')
        return
      }

      /*
       * Leaked password check AT SIGNUP, not in `validate`:
       * the check is a network request and `validate` is synchronous. The password NEVER leaves: only
       * the first 5 digits of the SHA-1 hash go (k-anonymity), matching happens in the browser.
       * If the service is unreachable, signup is NOT BLOCKED (fails open).
       */
      const leaked = await checkLeakedPassword(password)
      if (leaked.leaked) {
        setError(
          tx('Bu şifre bilinen veri sızıntılarında görülmüş ({count} kez). Lütfen başka bir şifre seçin.', { count: leaked.count.toLocaleString(intlLocale()) }),
        )
        return
      }

      const normalizedUsername = normalizeUsernameInput(username)
      const result = await signUpWithEmail(email.trim(), password, normalizedUsername, {
        persistAcrossBrowserRestart: rememberAcrossBrowserRestart,
      })

      if (result.status === 'email_confirmation_required') {
        setMode('login')
        setPassword('')
        setPasswordAgain('')
        /*
         * There is NO session in this branch, so the `users` row does not exist yet and the birth
         * date cannot be written. Nothing is lost: after the user confirms the email and signs
         * in, the age gate (Layout) asks for the date once.
         */
        setError(tx('Kayıt oluşturuldu. Lütfen {email} adresine gelen doğrulama mailini onaylayıp giriş yapın.', { email: result.email }))
        return
      }

      /*
       * The birth date is written RIGHT AFTER signup. On failure the signup is not
       * rolled back: the account is already open, and the age gate asks for the missing date
       * on the next step. Blowing up the signup would leave an open account
       * unusable.
       */
      await setMyBirthDate(birthDate).catch(() => undefined)

      /*
       * After signup comes setup, NOT the profile: the user just said "Continue"
       * and should not see an empty profile page in return. Layout redirects to
       * onboarding.
       */
      navigate('/', { replace: true })
    } catch (err) {
      setError(toAppErrorMessage(err, txa('Bir hata oluştu. Lütfen tekrar deneyin.')))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelMfa = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await cancelPendingMfa()
      setMfaCode('')
      setPassword('')
    } catch (err) {
      setError(toAppErrorMessage(err, txa('2FA doğrulaması iptal edilemedi.')))
    } finally {
      setSubmitting(false)
    }
  }

  // The welcome builds its own full-screen shell; the card layout is only for forms.
  if (mode === 'welcome' && !isMfaStep) {
    return (
      <AuthWelcome
        onEmailSignup={() => setMode('register')}
        onLogin={() => setMode('login')}
        onGuest={() => {
          // Without the flag the home page sends the visitor back to the welcome.
          markGuestWelcomeSeen()
          navigate('/')
        }}
      />
    )
  }

  return (
    /*
     * In the prototype Sign-in/Sign-up screens are FULL PAGE, with no centered card.
     * The route is already outside app chrome, so a card frame stood as a second
     * box. Measures from the prototype: title 27px/900, field 52px,
     * primary button 54px, radius 14-16px.
     */
    <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col px-5 pb-10 pt-4">
      <div className="w-full">
        {/*
          Karsilamaya donus yolu: formda takilan kullanici, sosyal giris
          secenegini gormeden geri donemiyordu.
        */}
        {!isMfaStep && !isLogin ? (
          <AuthSignupProgress onBack={() => setMode('welcome')} />
        ) : null}

        {!isMfaStep && isLogin ? (
          <button
            type="button"
            onClick={() => setMode('welcome')}
            data-testid="auth-back-to-welcome"
            className="mb-4 -ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {tx('Geri')}
          </button>
        ) : null}
        <div className="mb-6">
          {isMfaStep ? (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                {tx('İki Aşamalı Doğrulama')}
              </span>
            </div>
          ) : null}
          <h1 className="m-0 text-[27px] font-black leading-tight tracking-tight text-foreground">
            {isMfaStep ? tx('2FA Kodunu Gir') : isLogin ? tx('Giriş Yap') : tx('Aramıza katıl')}
          </h1>
          <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">
            {isMfaStep
              ? tx('{device} ile üretilen 6 haneli doğrulama kodunu girin.', { device: pendingMfa.friendlyName })
              : isLogin
                /*
                 * The prototype's promise: sign-in is not an obstacle but a return to where you left off.
                 */
                ? tx('Kütüphanen, geçmişin ve takip ettiğin ekipler tam bıraktığın gibi duruyor.')
                /*
                 * The prototype's sentence says "you can change it later", but
                 * USERNAMES CANNOT BE CHANGED HERE: only the display name
                 * changes (userService.updateMyDisplayName). Copying the prototype
                 * exactly would make a promise we cannot keep.
                 */
                : tx('Kullanıcı adın profilinde ve yorumlarında @etiket olarak görünür ve sonradan değiştirilemez.')}
          </p>
          {isMfaStep && pendingMfa.email ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {txa('Oturum:')}{' '}{pendingMfa.email}
            </p>
          ) : null}
        </div>

        {/*
          Prototipte Giris/Kayit arasi gecis SEKME CUBUGU degil, sayfanin
          dibindeki tek satirlik baglanti. Sekme cubugu ekranin en ustunde
          bir karar daha soruyordu; kullanici zaten hangisini istedigini
          secerek gelmis oluyor.
        */}
        {!isMfaStep && providers.length > 0 ? (
          <div className={cn('mb-1 gap-2.5', isLogin ? 'flex flex-col' : 'grid grid-cols-2')}>
            {providers.map((provider, index) => (
              <button
                key={provider.id}
                type="button"
                disabled={oauthBusy}
                onClick={() => { void handleProvider(provider) }}
                data-testid={`auth-oauth-${provider.id}`}
                className={cn(
                  'inline-flex items-center justify-center gap-2.5 rounded-2xl text-[15px] font-black disabled:opacity-60',
                  isLogin
                    ? index === 0
                      ? 'h-[52px] bg-primary text-primary-foreground'
                      : 'h-[50px] border border-border bg-card text-foreground'
                    // On signup, side by side with a SHORT label: the form is long, buttons should not
                    // cover half the screen (prototype pattern).
                    : 'h-[50px] border border-border bg-card text-foreground',
                )}
              >
                <ProviderGlyph id={provider.id} />
                {isLogin ? tx(provider.label) : PROVIDER_SHORT_LABELS[provider.id]}
              </button>
            ))}
          </div>
        ) : null}

        {!isMfaStep && providers.length > 0 ? (
          <div className="my-[22px] flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-bold text-muted-foreground">{tx('veya e-posta ile')}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {isMfaStep ? (
            <div className="space-y-1.5">
              <Label htmlFor="auth-mfa-code" className="text-xs font-extrabold uppercase tracking-[0.04em] text-muted-foreground">{tx('2FA Kodu')}</Label>
              <Input
                id="auth-mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value.replace(/[^\d\s]/g, '').slice(0, 8))}
                placeholder="000000"
                maxLength={8}
                required
              />
            </div>
          ) : (
            <>
              {!isLogin ? (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-username" className="text-xs font-extrabold uppercase tracking-[0.04em] text-muted-foreground">{tx('Kullanıcı adı')}</Label>
                  {/*
                    `@` oneki ALAN ICINDE (prototip): etiketin nasil
                    gorunecegini yazarken gostermek, kullanicinin basina
                    kendisi @ eklemesini onluyor.
                    Sagda durum ikonu: kontrol ediliyor / uygun / alinmis.
                  */}
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-bold text-muted-foreground">
                      @
                    </span>
                    <Input
                      className="h-[52px] rounded-[14px] pl-8 pr-11 text-[15px]"
                      id="auth-username"
                      type="text"
                      autoComplete="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder={tx('kullaniciadi')}
                      maxLength={32}
                      required
                    />
                    <span
                      className="absolute right-3.5 top-1/2 -translate-y-1/2"
                      data-testid="auth-username-icon"
                      data-state={usernameState}
                    >
                      {usernameState === 'checking' ? (
                        <Loader2 className="size-[18px] animate-spin text-muted-foreground" aria-hidden="true" />
                      ) : usernameState === 'available' ? (
                        <Check className="size-[18px] text-primary" aria-hidden="true" />
                      ) : usernameState === 'taken' ? (
                        <X className="size-[18px] text-destructive" aria-hidden="true" />
                      ) : null}
                    </span>
                  </div>
                  {/*
                    Kural satiri (prototip suRule): kurallar GONDERMEDEN
                    once gorunmeli, "gecersiz" deyip birakmak degil.
                  */}
                  <p className="m-0 text-[11px] font-semibold leading-4 text-muted-foreground">
                    {tx('3-24 karakter · küçük harf, rakam ve alt çizgi (_)')}
                    <br />
                    {tx('Görünen adını profilinden ayrıca düzenleyebilirsin.')}
                  </p>
                  {/*
                    Musaitlik CANLI: onceden ancak gonderdikten sonra
                    anlasiliyordu. "Bilinmiyor" durumu MUSAIT SAYILMAZ --
                    yesil tik gosterip gonderirken hata almak, hic
                    gostermemekten kotudur.
                  */}
                  {usernameState === 'checking' ? (
                    <p className="text-xs font-semibold text-muted-foreground" data-testid="auth-username-state">
                      {tx('Kontrol ediliyor...')}
                    </p>
                  ) : usernameState === 'available' ? (
                    <p className="text-xs font-bold text-primary" data-testid="auth-username-state">
                      {tx('@{username} kullanılabilir.', { username: normalizeUsernameInput(username) })}
                    </p>
                  ) : usernameState === 'taken' ? (
                    <div className="space-y-1.5" data-testid="auth-username-state">
                      <p className="m-0 text-xs font-bold text-destructive">
                        {tx('Bu etiket alınmış.')}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestUsernames(normalizeUsernameInput(username)).map((oneri) => (
                          <button
                            key={oneri}
                            type="button"
                            onClick={() => setUsername(oneri)}
                            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-foreground transition-colors hover:bg-muted"
                          >
                            @{oneri}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                </div>
              ) : null}

              {isLogin && lastAccount ? (
                <AuthLastAccountCard
                  account={lastAccount}
                  onForget={() => {
                    forgetLastAccount()
                    setLastAccount(null)
                    setEmail('')
                  }}
                />
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="auth-email" className="text-xs font-extrabold uppercase tracking-[0.04em] text-muted-foreground">{tx('E-posta')}</Label>
                <Input
                  className="h-[52px] rounded-[14px] text-[15px]"
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={tx('ornek@mail.com')}
                  required
                />
                {/*
                  Prototipte alanin altinda anlik bicim kontrolu var.
                  Gonderdikten sonra ogrenmek, formu bastan gozden
                  gecirmek demekti.
                */}
                {!isLogin && email.trim() && !EMAIL_PATTERN.test(email.trim()) ? (
                  <p className="m-0 text-xs font-bold text-destructive" data-testid="auth-email-invalid">
                    {tx('Geçerli bir e-posta gir.')}
                  </p>
                ) : null}
              </div>

              {!isLogin ? (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-birth-date" className="text-xs font-extrabold uppercase tracking-[0.04em] text-muted-foreground">{tx('Doğum tarihi')}</Label>
                  <Input
                    className="h-[52px] rounded-[14px] text-[15px]"
                    id="auth-birth-date"
                    type="date"
                    autoComplete="bday"
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    required
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    {tx('Yaşa uygun içerik gösterebilmek için gerekli. Sonradan değiştirilemez, profilinde görünmez.')}
                  </p>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="auth-password" className="text-xs font-extrabold uppercase tracking-[0.04em] text-muted-foreground">{tx('Şifre')}</Label>
                {/*
                  Goster/gizle: prototipte var ve gercek bir ise yariyor --
                  telefon klavyesinde yanlis yazilan sifreyi gormeden
                  duzeltmek zor.
                */}
                <div className="relative">
                  <Input
                    className="h-[52px] rounded-[14px] pr-14 text-[15px]"
                    id="auth-password"
                    type={passwordShown ? 'text' : 'password'}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={isLogin ? '••••••••' : tx('en az {count} karakter', { count: MIN_PASSWORD_LENGTH })}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordShown((prev) => !prev)}
                    aria-label={passwordShown ? tx('Şifreyi gizle') : tx('Şifreyi göster')}
                    data-testid="auth-password-toggle"
                    className="absolute right-1 top-1 grid size-11 place-items-center rounded-[11px] text-muted-foreground transition-colors hover:bg-muted"
                  >
                    {passwordShown
                      ? <EyeOff className="size-[18px]" aria-hidden="true" />
                      : <Eye className="size-[18px]" aria-hidden="true" />}
                  </button>
                </div>
                {!isLogin && password ? (
                  <AuthPasswordFeedback strength={passwordStrength} rules={passwordRules} />
                ) : null}
              </div>

              {!isLogin ? (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-password-again" className="text-xs font-extrabold uppercase tracking-[0.04em] text-muted-foreground">{tx('Şifre (tekrar)')}</Label>
                  <Input
                    id="auth-password-again"
                    type="password"
                    autoComplete="new-password"
                    value={passwordAgain}
                    onChange={(event) => setPasswordAgain(event.target.value)}
                    placeholder="********"
                    required
                  />
                </div>
              ) : null}

              {/*
                Prototipte bu ikisi TEK SATIR: solda "Beni hatirla", sagda
                "Sifremi unuttum". Onceki hali aciklamali bir kutuydu ve
                giris ekraninin en alt satirini uc satira cikariyordu.
              */}
              {/*
                ACIK ONAY (prototip). Dipnottaki "devam ederek kabul edersin"
                ifadesi zimni onaydir; kutu, kullanicinin neyi kabul ettigini
                GORMESINI sart kosuyor. "13 yasindan buyugum" ibaresi
                kaldirildi: yasi artik dogum tarihinden BILIYORUZ, beyan
                istemek gereksiz bir soru olurdu.
              */}
              {!isLogin ? (
                <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-5 text-muted-foreground">
                  <input
                    id="auth-terms-consent"
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    required
                  />
                  <span>
                    {locale === 'en' ? 'I have read and accept the ' : null}
                    <a href={localizeHref(TERMS_PATH, locale)} className="font-bold text-primary underline-offset-4 hover:underline">
                      {tx('Kullanım Koşulları')}
                    </a>
                    {' '}{tx('ve')}{' '}
                    <a href={localizeHref(PRIVACY_PATH, locale)} className="font-bold text-primary underline-offset-4 hover:underline">
                      {tx('Gizlilik Politikası')}
                    </a>
                    {locale === 'en' ? '.' : "'nı okudum, kabul ediyorum."}
                  </span>
                </label>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-bold text-foreground">
                  <input
                    id="auth-remember-device"
                    type="checkbox"
                    className="size-4 rounded border-border accent-primary"
                    checked={rememberAcrossBrowserRestart}
                    onChange={(event) => setRememberAcrossBrowserRestart(event.target.checked)}
                  />
                  {tx('Beni hatırla')}
                </label>
                {/*
                  "Şifremi unuttum" prototipte var ama BIZDE CALISMIYOR:
                  sifre sifirlama yalnizca GIRIS YAPMIS kullanici icin var
                  (accountCenterService) ve e-posta gonderimi bekleyen SMTP
                  isine bagli. Calismayan bir baglanti basmak, dokununca
                  hicbir sey olmayan bir dugme demekti -- ayni kurali sosyal
                  giris dugmelerinde de uyguladik.
                */}
              </div>
            </>
          )}

          {error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="h-[54px] w-full rounded-2xl text-[15px] font-black" disabled={submitting}>
            {submitting
              ? tx('Lütfen bekleyin...')
              : isMfaStep
                ? tx('2FA Kodunu Doğrula')
                : isLogin
                  ? tx('Giriş Yap')
                  /*
                   * "Continue" (prototype): the form is not the END of signup but the first step of setup.
                   * "Sign up" implied it was finished.
                   */
                  : tx('Devam')}
          </Button>

          {isMfaStep ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => void handleCancelMfa()} disabled={submitting}>
              {tx('Girişi İptal Et')}
            </Button>
          ) : (
            <>
              <p className="text-center text-sm text-muted-foreground">
                {isLogin ? tx('Hesabın yok mu?') : tx('Zaten hesabın var mı?')}{' '}
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    setMode(isLogin ? 'register' : 'login')
                    setError(null)
                  }}
                >
                  {isLogin ? tx('Kayıt ol') : tx('Giriş yap')}
                </button>
              </p>
              {/*
                Dipnot yalnizca GIRISTE: kayitta ayni onay artik ACIK KUTUYLA
                aliniyor, ikisini birden basmak ayni seyi iki kez soylemek
                olurdu (prototipte de yalnizca kutu var).
              */}
              {isLogin ? (
              <p className="text-center text-xs leading-6 text-muted-foreground">
                {tx('Devam ederek')}{' '}
                <a href={localizeHref(TERMS_PATH, locale)} className="font-medium text-primary underline-offset-4 hover:underline">
                  {tx('Kullanım Koşulları')}
                </a>
                ,{' '}
                <a href={localizeHref(PRIVACY_PATH, locale)} className="font-medium text-primary underline-offset-4 hover:underline">
                  {tx('Gizlilik Politikası')}
                </a>
                {' '}{tx('ve')}{' '}
                <a href={localizeHref(KVKK_PATH, locale)} className="font-medium text-primary underline-offset-4 hover:underline">
                  {tx('KVKK')}
                </a>
                {locale === 'en' ? '.' : ' metinlerine tabi olduğunu kabul edersin.'}
              </p>
              ) : null}
            </>
          )}
        </form>
      </div>
    </div>
  )
}

export default AuthPage
