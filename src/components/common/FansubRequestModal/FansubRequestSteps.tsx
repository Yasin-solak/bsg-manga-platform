import type { ChangeEvent, ReactNode, RefObject, UIEvent } from 'react'
import { Link } from '@/i18n/router'
import { FileText, ImagePlus, Info, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  COPYRIGHT_POLICY_PATH,
  ENFORCEMENT_POLICY_PATH,
  FANSUB_RULES_PATH,
} from '@/lib/policyRoutes'
import { cn } from '@/lib/utils'
import { FANSUB_DESCRIPTION_MAX_LENGTH, FANSUB_NAME_MAX_LENGTH } from '@/services/fansubService'
import {
  CONTENT_TYPE_OPTIONS,
  GENRE_SUGGESTIONS,
  TEAM_ROLE_OPTIONS,
  appendCsvValue,
  formatListValue,
  getAgeRatingLabel,
  getExperienceLabel,
  splitCsv,
  toggleListValue,
  type FansubAgeRatingPolicy,
  type FansubExperienceLevel,
  type FansubRequestDraft,
} from './fansubRequestModal.shared'
import { txa } from '@/i18n/activeLocale'

interface FansubRequestStepProps {
  draft: FansubRequestDraft
  updateDraft: (patch: Partial<FansubRequestDraft>) => void
  selectBaseClasses: string
}

interface FansubRequestIdentityStepProps extends FansubRequestStepProps {
  avatarFile: File | null
  avatarPreviewUrl: string | null
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void
}

interface FansubRequestReviewStepProps extends FansubRequestIdentityStepProps {
  dmcaExpanded: boolean
  dmcaScrolledToEnd: boolean
  dmcaScrollRef: RefObject<HTMLDivElement>
  onDmcaExpandedChange: (expanded: boolean) => void
  onDmcaScroll: (event: UIEvent<HTMLDivElement>) => void
  onDmcaAcceptanceChange: (event: ChangeEvent<HTMLInputElement>) => void
}

function SectionShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-md border border-border/70 bg-card/55 p-4">
      <div className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
        <h3 className="mt-1 text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

function ChipButton({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'h-8 rounded-full border border-border bg-background px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/70 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
        active && 'border-primary bg-primary/10 text-primary',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function FansubRequestIdentityStep({
  draft,
  updateDraft,
  avatarFile,
  avatarPreviewUrl,
  onAvatarChange,
}: FansubRequestIdentityStepProps) {
  return (
    <SectionShell
      eyebrow={txa('Kimlik')}
      title={txa('Fansub vitrininin temel bilgileri')}
      description={txa('Kısa, net ve adminin tek bakışta anlayabileceği bir başvuru hazırla.')}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="frm-name">{txa('Fansub Adı')}</Label>
              <span className="text-xs text-muted-foreground">{draft.name.length}/{FANSUB_NAME_MAX_LENGTH}</span>
            </div>
            <Input
              id="frm-name"
              type="text"
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              placeholder={txa('Örn. Night Owls Scan')}
              maxLength={FANSUB_NAME_MAX_LENGTH}
              required
              className="h-11 rounded-md"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="frm-description">{txa('Kısa Açıklama')}</Label>
              <span className="text-xs text-muted-foreground">
                {draft.description.length}/{FANSUB_DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              id="frm-description"
              value={draft.description}
              onChange={(event) => updateDraft({ description: event.target.value })}
              placeholder={txa('Fansubunuz neye odaklanıyor?')}
              rows={4}
              maxLength={FANSUB_DESCRIPTION_MAX_LENGTH}
              required
              className="min-h-[118px] resize-none rounded-md"
            />
          </div>
        </div>

        <div className="rounded-md border border-border bg-background p-3">
          <Label htmlFor="frm-avatar" className="mb-2 block">{txa('Avatar')}</Label>
          <div className="mb-3 grid place-items-center rounded-md border border-dashed border-border bg-muted/30 p-3">
            {avatarPreviewUrl ? (
              <img
                src={avatarPreviewUrl}
                alt={txa('Avatar önizleme')}
                className="h-24 w-24 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="grid h-24 w-24 place-items-center rounded-full border border-border bg-card text-muted-foreground">
                <ImagePlus className="h-8 w-8" aria-hidden="true" />
              </div>
            )}
          </div>
          <Input id="frm-avatar" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onAvatarChange} />
          <p className="mt-2 break-words text-[11px] leading-snug text-muted-foreground">
            {avatarFile ? avatarFile.name : txa('JPG, PNG, WEBP veya GIF. Maksimum 2MB.')}
          </p>
        </div>
      </div>
    </SectionShell>
  )
}

export function FansubRequestPublishingStep({
  draft,
  updateDraft,
  selectBaseClasses,
}: FansubRequestStepProps) {
  const focusGenres = splitCsv(draft.focusGenresInput)

  return (
    <SectionShell
      eyebrow={txa('Yayın')}
      title={txa('Ne çevireceksiniz ve ritminiz ne?')}
      description={txa('Buradaki metrikler admin panelinde yayın kapasitesi ve odak kontrolü için görünecek.')}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="frm-focus-genres">{txa('Odak Türler')}</Label>
          <Input
            id="frm-focus-genres"
            type="text"
            value={draft.focusGenresInput}
            onChange={(event) => updateDraft({ focusGenresInput: event.target.value })}
            placeholder={txa('Aksiyon, Fantastik, Slice of Life')}
            className="h-11 rounded-md"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {GENRE_SUGGESTIONS.map((genre) => (
              <ChipButton
                key={genre}
                active={focusGenres.some((item) => item.toLowerCase() === genre.toLowerCase())}
                onClick={() => updateDraft({ focusGenresInput: appendCsvValue(draft.focusGenresInput, genre) })}
              >
                + {genre}
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="frm-weekly-goal">{txa('Haftalık Hedef Bölüm')}</Label>
          <Input
            id="frm-weekly-goal"
            type="number"
            min={1}
            max={100}
            value={draft.weeklyReleaseGoal}
            onChange={(event) => updateDraft({ weeklyReleaseGoal: event.target.value })}
            placeholder={txa('Örn. 3')}
            className="h-11 rounded-md"
          />
          <p className="text-xs text-muted-foreground">{txa('Onayli yayin planini abartmadan gir; ileride degistirilebilir.')}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{txa('İçerik Tipleri')}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {CONTENT_TYPE_OPTIONS.map((item) => (
              <ChipButton
                key={item}
                active={draft.contentTypes.includes(item)}
                onClick={() => updateDraft({ contentTypes: toggleListValue(draft.contentTypes, item) })}
              >
                {item}
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="frm-exp-level">{txa('Deneyim Seviyesi')}</Label>
          <select
            id="frm-exp-level"
            className={selectBaseClasses}
            value={draft.experienceLevel}
            onChange={(event) => updateDraft({ experienceLevel: event.target.value as FansubExperienceLevel })}
          >
            <option value="new">{txa('Yeni ekip')}</option>
            <option value="intermediate">{txa('Orta seviye ekip')}</option>
            <option value="experienced">{txa('Deneyimli ekip')}</option>
          </select>
        </div>
      </div>
    </SectionShell>
  )
}

export function FansubRequestTeamStep({
  draft,
  updateDraft,
}: FansubRequestStepProps) {
  return (
    <SectionShell
      eyebrow={txa('Ekip')}
      title={txa('Ekip yapısı ve ulaşılabilirlik')}
      description={txa('Admin kararında en kritik alanlar ekip kapasitesi ve gerçek iletişim bilgisidir.')}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="frm-team-size">{txa('Ekip Büyüklüğü')}</Label>
          <Input
            id="frm-team-size"
            type="number"
            min={1}
            max={200}
            value={draft.teamSize}
            onChange={(event) => updateDraft({ teamSize: event.target.value })}
            placeholder={txa('Örn. 6')}
            className="h-11 rounded-md"
          />
        </div>

        <div className="rounded-md border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="frm-recruitment-open">{txa('Yeni üye alımı')}</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {txa('Açıksa ihtiyaç duyulan roller admin tarafında görünür.')}
              </p>
            </div>
            <Switch
              id="frm-recruitment-open"
              checked={draft.recruitmentOpen}
              onCheckedChange={(checked) => updateDraft({ recruitmentOpen: checked })}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-1.5">
        <Label>{txa('Kritik Açık Roller')}</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEAM_ROLE_OPTIONS.map((role) => (
            <ChipButton
              key={role}
              active={draft.teamRolesNeeded.includes(role)}
              onClick={() => updateDraft({ teamRolesNeeded: toggleListValue(draft.teamRolesNeeded, role) })}
            >
              {role}
            </ChipButton>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="frm-contact-email">{txa('İletişim E-posta')}</Label>
          <Input
            id="frm-contact-email"
            type="email"
            value={draft.contactEmail}
            onChange={(event) => updateDraft({ contactEmail: event.target.value })}
            placeholder={txa('ornek@fansub.com')}
            className="h-11 rounded-md"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="frm-contact-discord">{txa('Discord')}</Label>
          <Input
            id="frm-contact-discord"
            type="text"
            value={draft.contactDiscord}
            onChange={(event) => updateDraft({ contactDiscord: event.target.value })}
            placeholder={txa('kullanıcı#1234 veya davet linki')}
            className="h-11 rounded-md"
          />
        </div>
      </div>
    </SectionShell>
  )
}

export function FansubRequestReviewStep({
  draft,
  updateDraft,
  selectBaseClasses,
  dmcaExpanded,
  dmcaScrolledToEnd,
  dmcaScrollRef,
  onDmcaExpandedChange,
  onDmcaScroll,
  onDmcaAcceptanceChange,
}: FansubRequestReviewStepProps) {
  return (
    <SectionShell
      eyebrow={txa('Son Kontrol')}
      title={txa('Kurallar, yas politikasi ve ek notlar')}
      description={txa('Başvuru gönderildiğinde bu bilgiler bekleyen talep detayına yazılır.')}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="frm-age-policy">{txa('Yaş Politikası')}</Label>
          <select
            id="frm-age-policy"
            className={selectBaseClasses}
            value={draft.ageRatingPolicy}
            onChange={(event) => updateDraft({ ageRatingPolicy: event.target.value as FansubAgeRatingPolicy })}
          >
            <option value="all">{txa('Herkese uygun')}</option>
            <option value="teen">{txa('13+ ağırlıklı')}</option>
            <option value="mature">{txa('Yetişkin içerik olabilir')}</option>
          </select>
        </div>

        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{txa('Özet')}</p>
          <p className="mt-1 text-xs text-foreground">
            {formatListValue(splitCsv(draft.focusGenresInput))} - {getExperienceLabel(draft.experienceLevel)} -{' '}
            {getAgeRatingLabel(draft.ageRatingPolicy)}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-1.5">
        <Label htmlFor="frm-portfolio-notes">{txa('Ek Notlar / Portfolyo Açıklaması')}</Label>
        <Textarea
          id="frm-portfolio-notes"
          value={draft.portfolioNotes}
          onChange={(event) => updateDraft({ portfolioNotes: event.target.value })}
          placeholder={txa('Özel notlar, ekip geçmişi, referans proje bilgisi...')}
          rows={4}
          maxLength={1000}
          className="min-h-[108px] resize-none rounded-md"
        />
      </div>

      <div className="mt-5 rounded-md border border-primary/30 bg-primary/10 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">{txa('DMCA ve telif beyanı')}</p>
              <p className="text-xs text-muted-foreground">{txa('Onay için metni sonuna kadar oku.')}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md"
            onClick={() => onDmcaExpandedChange(!dmcaExpanded)}
          >
            {dmcaExpanded ? txa('Metni gizle') : txa('Metni oku')}
          </Button>
        </div>

        {dmcaExpanded ? (
          <ScrollArea className="mt-3 h-[150px] rounded-md border border-border bg-background">
            <div
              ref={dmcaScrollRef}
              className="h-[150px] overflow-y-auto p-3"
              onScroll={onDmcaScroll}
              role="region"
              aria-label={txa('DMCA ve telif beyan metni')}
            >
              <p className="mb-2 text-xs leading-relaxed text-foreground">
                {txa('1. Yüklediğiniz veya çevirdiğiniz içeriklerde telif sahibinin haklarını ihlal etmemeyi kabul edersiniz.')}
              </p>
              <p className="mb-2 text-xs leading-relaxed text-foreground">
                {txa('2. DMCA uyarısında ilgili içeriği hızlı şekilde kaldıracağınızı ve ekiple bu konuda iş birliği')}
                {txa('yapacağınızı kabul edersiniz.')}
              </p>
              <p className="mb-2 text-xs leading-relaxed text-foreground">
                {txa('3. Tekrarlayan ihlal durumunda fansub talebinizin reddedilebileceğini veya mevcut fansub yetkilerinizin')}
                {txa('iptal edilebileceğini kabul edersiniz.')}
              </p>
              <p className="mb-0 text-xs leading-relaxed text-foreground">
                {txa('4. Eser sahibi talebi geldiğinde kaynak, çeviri ve yayın kayıtlarının doğrulanabilir olmasından sorumlu')}
                {txa('olduğunuzu kabul edersiniz.')}
              </p>
            </div>
          </ScrollArea>
        ) : null}

        {!dmcaScrolledToEnd ? (
          <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {txa('Onay kutusu metin sonuna gelmeden aktif olmaz.')}
          </p>
        ) : null}

        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={draft.dmcaAccepted}
            onChange={onDmcaAcceptanceChange}
          />
          <span>{txa('DMCA ve telif beyanını kabul ediyorum.')}</span>
        </label>
      </div>

      <div className="mt-5 rounded-md border border-border/60 bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
        <FileText className="mr-1 inline h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {txa('Basvuru gondererek')}{' '}
        <Link to={FANSUB_RULES_PATH} className="font-medium text-foreground transition-colors hover:text-primary">
          {txa('Fansub Kurallari')}
        </Link>
        ,{' '}
        <Link to={COPYRIGHT_POLICY_PATH} className="font-medium text-foreground transition-colors hover:text-primary">
          {txa('Telif ve Icerik Kaldirma')}
        </Link>{' '}
        {txa('ve gerekirse')}{' '}
        <Link to={ENFORCEMENT_POLICY_PATH} className="font-medium text-foreground transition-colors hover:text-primary">
          {txa('Yaptirim Politikasi')}
        </Link>{' '}
        {txa('kapsamında inceleme yapılacağını kabul edersin.')}
      </div>
    </SectionShell>
  )
}
