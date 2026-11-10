import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { PlusCircle } from 'lucide-react'
import type { SecuritySeverity } from '@/services/adminSecurityService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_NEW_EVENT_FORM,
  normalizeEventType,
  normalizeSource,
  type NewSecurityEventFormState,
} from './adminOpsSecurityUtils'
import { txa } from '@/i18n/activeLocale'

interface AdminOpsSecurityCreateEventCardProps {
  newEventForm: NewSecurityEventFormState
  setNewEventForm: Dispatch<SetStateAction<NewSecurityEventFormState>>
  newEventSaving: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

const selectInputClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm'

export function AdminOpsSecurityCreateEventCard({
  newEventForm,
  setNewEventForm,
  newEventSaving,
  onSubmit,
}: AdminOpsSecurityCreateEventCardProps) {
  return (
    <AdminSurface className="p-4" data-testid="admin-ops-security-create-event">
      {/*
        Form KAPALI baslar. Gunde bir kez kullanilan bir yazma araci, her
        acilista okuma yuzeylerinin arasini bolup sayfayi uzatmamali; ama
        akisin hemen ustunde durmali ki "bu listeye elle kayit nasil girilir"
        sorusu aranmadan cevaplansin.
      */}
      <details className="group">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 font-heading text-base text-foreground">
          <PlusCircle className="size-4 text-muted-foreground" aria-hidden="true" />
          {txa('Manuel guvenlik eventi ekle')}
        </summary>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2 max-[680px]:grid-cols-1"
        onSubmit={onSubmit}
      >
        <label className="flex flex-col gap-1.5 text-xs font-bold">
          {txa('Kaynak')}
          <Input
            type="text"
            value={newEventForm.source}
            onChange={(event) =>
              setNewEventForm((prev) => ({ ...prev, source: event.target.value }))
            }
            onBlur={() =>
              setNewEventForm((prev) => ({
                ...prev,
                source: normalizeSource(prev.source),
              }))
            }
            maxLength={64}
            placeholder="auth|redeem|admin|store"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-bold">
          {txa('Event Tipi')}
          <Input
            type="text"
            value={newEventForm.eventType}
            onChange={(event) =>
              setNewEventForm((prev) => ({ ...prev, eventType: event.target.value }))
            }
            onBlur={() =>
              setNewEventForm((prev) => ({
                ...prev,
                eventType: normalizeEventType(prev.eventType),
              }))
            }
            maxLength={96}
            placeholder="suspicious_redeem_attempt"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-bold">
          {txa('Severity')}
          <select
            className={selectInputClass}
            value={newEventForm.severity}
            onChange={(event) =>
              setNewEventForm((prev) => ({
                ...prev,
                severity: event.target.value as SecuritySeverity,
              }))
            }
          >
            <option value="low">{txa('Low')}</option>
            <option value="medium">{txa('Medium')}</option>
            <option value="high">{txa('High')}</option>
            <option value="critical">{txa('Critical')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-bold">
          {txa('Hedef Kullanici ID (opsiyonel)')}
          <Input
            type="text"
            value={newEventForm.targetUserId}
            onChange={(event) =>
              setNewEventForm((prev) => ({
                ...prev,
                targetUserId: event.target.value,
              }))
            }
            placeholder="uuid"
            maxLength={64}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-bold sm:col-span-2 max-[680px]:col-span-1">
          {txa('Mesaj')}
          <Textarea
            value={newEventForm.message}
            onChange={(event) =>
              setNewEventForm((prev) => ({ ...prev, message: event.target.value }))
            }
            rows={2}
            maxLength={500}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-bold sm:col-span-2 max-[680px]:col-span-1">
          {txa('Metadata JSON (opsiyonel)')}
          <Textarea
            value={newEventForm.metadataText}
            onChange={(event) =>
              setNewEventForm((prev) => ({
                ...prev,
                metadataText: event.target.value,
              }))
            }
            rows={3}
            placeholder='{"ip":"x.x.x.x","note":"..."}'
          />
        </label>
        <div className="flex justify-end gap-2.5 sm:col-span-2 max-[680px]:col-span-1">
          {/* "Formu sifirla" YIKICI DEGIL: hicbir kayda dokunmaz, sadece
              taslagi bosaltir. Kirmizi olmasi gercek yikici islemlerin
              uyarisini degersizlestiriyordu. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setNewEventForm(DEFAULT_NEW_EVENT_FORM)}
            disabled={newEventSaving}
          >
            {txa('Formu sifirla')}
          </Button>
          <Button type="submit" variant="default" disabled={newEventSaving}>
            {newEventSaving ? txa('Kaydediliyor...') : txa('Event kaydet')}
          </Button>
        </div>
      </form>
      </details>
    </AdminSurface>
  )
}

