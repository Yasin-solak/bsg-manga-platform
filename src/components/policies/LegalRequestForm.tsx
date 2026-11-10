import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { Scale, Send, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  isLegalRequestValidationError,
  legalRequestTypeOptions,
  parseLines,
  submitLegalRequest,
  type CreateLegalRequestInput,
  type LegalRequestType,
  type LegalRequestValidationErrors,
} from '@/services/legalRequestService'
import { toast } from '@/services/toastService'
import { COPYRIGHT_POLICY_PATH, DMCA_PATH, ENFORCEMENT_POLICY_PATH } from '@/lib/policyRoutes'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface LegalRequestFormProps {
  initialType?: LegalRequestType
}

interface LegalRequestFormState {
  requestType: LegalRequestType
  fullName: string
  organizationName: string
  email: string
  claimantRole: string
  subject: string
  description: string
  targetUrlsText: string
  evidenceText: string
  electronicSignature: string
  attestationGoodFaith: boolean
  attestationAuthority: boolean
  attestationAccuracy: boolean
}

type FormErrors = Partial<Record<keyof LegalRequestFormState, string>>

function createInitialState(requestType: LegalRequestType): LegalRequestFormState {
  return {
    requestType,
    fullName: '',
    organizationName: '',
    email: '',
    claimantRole: '',
    subject: '',
    description: '',
    targetUrlsText: '',
    evidenceText: '',
    electronicSignature: '',
    attestationGoodFaith: false,
    attestationAuthority: false,
    attestationAccuracy: false,
  }
}

function toInput(state: LegalRequestFormState): CreateLegalRequestInput {
  return {
    requestType: state.requestType,
    fullName: state.fullName,
    organizationName: state.organizationName,
    email: state.email,
    claimantRole: state.claimantRole,
    subject: state.subject,
    description: state.description,
    targetUrls: parseLines(state.targetUrlsText),
    evidence: parseLines(state.evidenceText),
    electronicSignature: state.electronicSignature,
    attestationGoodFaith: state.attestationGoodFaith,
    attestationAuthority: state.attestationAuthority,
    attestationAccuracy: state.attestationAccuracy,
  }
}

function mapErrorToField(message: string): keyof LegalRequestFormState | null {
  if (message.includes(txa('Ad soyad'))) return 'fullName'
  if (message.includes('e-posta')) return 'email'
  if (message.includes(txa('Konu'))) return 'subject'
  if (message.includes(txa('Açıklama'))) return 'description'
  if (message.includes('baglanti')) return 'targetUrlsText'
  if (message.includes('imza')) return 'electronicSignature'
  if (message.includes(txa('İyi niyet'))) return 'attestationGoodFaith'
  if (message.includes(txa('Yetki'))) return 'attestationAuthority'
  if (message.includes(txa('Doğruluk'))) return 'attestationAccuracy'
  return null
}

function mapValidationErrorsToFormErrors(fieldErrors: LegalRequestValidationErrors): FormErrors {
  const nextErrors: FormErrors = {}

  if (fieldErrors.fullName) nextErrors.fullName = fieldErrors.fullName
  if (fieldErrors.email) nextErrors.email = fieldErrors.email
  if (fieldErrors.subject) nextErrors.subject = fieldErrors.subject
  if (fieldErrors.description) nextErrors.description = fieldErrors.description
  if (fieldErrors.targetUrls) nextErrors.targetUrlsText = fieldErrors.targetUrls
  if (fieldErrors.electronicSignature) nextErrors.electronicSignature = fieldErrors.electronicSignature
  if (fieldErrors.attestationGoodFaith) nextErrors.attestationGoodFaith = fieldErrors.attestationGoodFaith
  if (fieldErrors.attestationAuthority) nextErrors.attestationAuthority = fieldErrors.attestationAuthority
  if (fieldErrors.attestationAccuracy) nextErrors.attestationAccuracy = fieldErrors.attestationAccuracy

  return nextErrors
}

export function LegalRequestForm({ initialType = 'copyright' }: LegalRequestFormProps) {
  const [form, setForm] = useState<LegalRequestFormState>(() => createInitialState(initialType))
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedType = useMemo(
    () => legalRequestTypeOptions.find((option) => option.value === form.requestType) || legalRequestTypeOptions[0],
    [form.requestType],
  )

  const submitHelperText = form.requestType === 'dmca'
    ? txa('DMCA bildirimi iyi niyet, yetki ve doğruluk beyanları olmadan işleme alınmaz.')
    : txa('Hak sahipliği, yetki ve hedef URL bilgisi net olmayan talepler ek bilgi talebine düşürülür.')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setIsSubmitting(true)

    try {
      await submitLegalRequest(toInput(form))
      toast.success(txa('Yasal talebiniz alındı. İnceleme kuyruğuna düşürüldü.'))
      setForm(createInitialState(form.requestType))
    } catch (error) {
      if (isLegalRequestValidationError(error)) {
        setErrors(mapValidationErrorsToFormErrors(error.fieldErrors))
        toast.warning(error.message)
        return
      }

      const message = error instanceof Error ? error.message : txa('Yasal talep gönderilemedi.')
      const field = mapErrorToField(message)
      if (field) {
        setErrors((prev) => ({ ...prev, [field]: message }))
      }
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap gap-3">
          {legalRequestTypeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setForm((prev) => ({ ...prev, requestType: option.value }))
                setErrors({})
              }}
              className={cn(
                'min-w-[220px] flex-1 rounded-[24px] border px-4 py-4 text-left transition-colors',
                form.requestType === option.value
                  ? 'border-primary/35 bg-primary/10 shadow-sm'
                  : 'border-border/70 bg-background/85 hover:border-primary/20',
              )}
            >
              <p className="text-sm font-semibold text-foreground">{option.label}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{option.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">{txa('Resmi Başvuru')}</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{selectedType.label}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
              {txa('Bu form destek kutusuna değil, doğrudan admin paneldeki yasal talepler kuyruğuna düşer.')}
            </p>
          </div>
          <div className="max-w-sm rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">
            {submitHelperText}
          </div>
        </div>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={txa('Ad Soyad')} htmlFor="legal-full-name" error={errors.fullName}>
              <Input
                id="legal-full-name"
                value={form.fullName}
                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                maxLength={120}
                placeholder={txa('Başvuru sahibi')}
              />
            </Field>
            <Field label={txa('E-posta')} htmlFor="legal-email" error={errors.email}>
              <Input
                id="legal-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                maxLength={160}
                placeholder={txa('ornek@alanadi.com')}
              />
            </Field>
            <Field label={txa('Kurum / Ekip')} htmlFor="legal-organization" optional>
              <Input
                id="legal-organization"
                value={form.organizationName}
                onChange={(event) => setForm((prev) => ({ ...prev, organizationName: event.target.value }))}
                maxLength={160}
                placeholder={txa('Varsa kurum veya ekip adı')}
              />
            </Field>
            <Field label={txa('Başvuranın rolü')} htmlFor="legal-role" optional>
              <Input
                id="legal-role"
                value={form.claimantRole}
                onChange={(event) => setForm((prev) => ({ ...prev, claimantRole: event.target.value }))}
                maxLength={120}
                placeholder={txa('Hak sahibi, temsilci, vekil...')}
              />
            </Field>
          </div>

          <Field label={txa('Konu')} htmlFor="legal-subject" error={errors.subject}>
            <Input
              id="legal-subject"
              value={form.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              maxLength={180}
              placeholder={txa('Kısa ve resmi konu başlığı')}
            />
          </Field>

          <Field
            label={txa('İhlal açıklaması')}
            htmlFor="legal-description"
            error={errors.description}
            help={txa('Hak sahipliği, ihlalin nedeni ve beklenen işlemi açıkça belirtin.')}
          >
            <Textarea
              id="legal-description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={7}
              maxLength={4000}
              className="resize-y"
              placeholder={txa('Hangi hakkın ihlal edildiğini, neden kaldırma veya inceleme talep ettiğinizi ayrıntılandırın.')}
            />
          </Field>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field
              label={txa('Hedef URL\'ler')}
              htmlFor="legal-target-urls"
              error={errors.targetUrlsText}
              help={txa('Her satıra tek bağlantı yazın. İç linkler / ile, dış linkler tam URL ile girilebilir.')}
            >
              <Textarea
                id="legal-target-urls"
                value={form.targetUrlsText}
                onChange={(event) => setForm((prev) => ({ ...prev, targetUrlsText: event.target.value }))}
                rows={6}
                className="resize-y"
                placeholder={"/manga/ornek-seri\n/fansub/ornek-ekip\nhttps://alanadi.com/ornek"}
              />
            </Field>
            <Field
              label={txa('Ek kanit veya referans')}
              htmlFor="legal-evidence"
              optional
              help={txa('Her satıra ek bir URL, referans veya dosya açıklaması yazabilirsiniz.')}
            >
              <Textarea
                id="legal-evidence"
                value={form.evidenceText}
                onChange={(event) => setForm((prev) => ({ ...prev, evidenceText: event.target.value }))}
                rows={6}
                className="resize-y"
                placeholder={txa('Opsiyonel kanıtlar, arama numaraları veya ek bağlantılar')}
              />
            </Field>
          </div>

          <Field label={txa('Elektronik imza')} htmlFor="legal-signature" error={errors.electronicSignature}>
            <Input
              id="legal-signature"
              value={form.electronicSignature}
              onChange={(event) => setForm((prev) => ({ ...prev, electronicSignature: event.target.value }))}
              maxLength={120}
              placeholder={txa('Ad Soyad')}
            />
          </Field>

          <div className="grid gap-3 rounded-[24px] border border-border/70 bg-background/85 p-4">
            <AttestationRow
              checked={form.attestationGoodFaith}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, attestationGoodFaith: checked }))}
              error={errors.attestationGoodFaith}
              label={txa('İyi niyetle hareket ettiğimi ve talebin hak ihlaline dayandığına inandığımı beyan ederim.')}
            />
            <AttestationRow
              checked={form.attestationAuthority}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, attestationAuthority: checked }))}
              error={errors.attestationAuthority}
              label={txa('Hak sahibi olduğumu veya hak sahibi adına yetkili olduğumu beyan ederim.')}
            />
            <AttestationRow
              checked={form.attestationAccuracy}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, attestationAccuracy: checked }))}
              error={errors.attestationAccuracy}
              label={txa('Verdiğim bilgilerin doğru olduğunu ve yanıltıcı beyanın yaptırıma konu olabileceğini kabul ederim.')}
            />
          </div>

          <div className="flex flex-col gap-4 rounded-[24px] border border-border/70 bg-background/85 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Scale className="size-4 text-primary" />
                <span>
                  {txa('Resmi metinler icin')}{' '}
                  <Link to={COPYRIGHT_POLICY_PATH} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {txa('telif merkezi')}
                  </Link>{' '}
                  {txa('ve')}{' '}
                  <Link to={DMCA_PATH} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {txa('DMCA bildirimi')}
                  </Link>{' '}
                  {txa('sayfalarına da bakabilirsiniz.')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-primary" />
                <span>
                  {txa('Kotu niyetli veya yaniltici basvurular')}{' '}
                  <Link to={ENFORCEMENT_POLICY_PATH} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {txa('Yaptırım Politikası')}
                  </Link>{' '}
                  {txa('kapsamında değerlendirilir.')}
                </span>
              </div>
            </div>
            <Button type="submit" size="lg" disabled={isSubmitting} className="min-w-[220px]">
              <Send className="mr-2 size-4" />
              {isSubmitting ? txa('Gönderiliyor...') : txa('Yasal Talebi Gönder')}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  error,
  help,
  optional = false,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  help?: string
  optional?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional ? <span className="text-xs text-muted-foreground">{txa('Opsiyonel')}</span> : null}
      </div>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {!error && help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  )
}

function AttestationRow({
  checked,
  onCheckedChange,
  label,
  error,
}: {
  checked: boolean
  onCheckedChange: (value: boolean) => void
  label: string
  error?: string
}) {
  return (
    <label className="grid gap-1 text-sm leading-6 text-muted-foreground">
      <span className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="mt-1 size-4 rounded border-border text-primary focus:ring-primary"
        />
        <span>{label}</span>
      </span>
      {error ? <span className="pl-7 text-xs text-destructive">{error}</span> : null}
    </label>
  )
}
