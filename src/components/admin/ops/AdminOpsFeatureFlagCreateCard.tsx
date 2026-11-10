import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { normalizeFeatureFlagKey } from '@/services/adminOpsService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_NEW_FLAG_FORM,
  type NewFeatureFlagFormState,
} from './adminOpsUtils'
import { txa } from '@/i18n/activeLocale'

interface AdminOpsFeatureFlagCreateCardProps {
  creatingFlag: boolean
  newFlagForm: NewFeatureFlagFormState
  setNewFlagForm: Dispatch<SetStateAction<NewFeatureFlagFormState>>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function AdminOpsFeatureFlagCreateCard({
  creatingFlag,
  newFlagForm,
  setNewFlagForm,
  onSubmit,
}: AdminOpsFeatureFlagCreateCardProps) {
  return (
    <AdminSurface className="p-5">
      <h2 className="mb-4 font-heading text-base text-foreground">
        {txa('Yeni Flag Ekle')}
      </h2>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label>{txa('Anahtar')}</Label>
          <Input
            type="text"
            value={newFlagForm.key}
            onChange={(event) =>
              setNewFlagForm((prev) => ({ ...prev, key: event.target.value }))
            }
            onBlur={() =>
              setNewFlagForm((prev) => ({
                ...prev,
                key: normalizeFeatureFlagKey(prev.key),
              }))
            }
            placeholder={txa('ornek.modul_adi')}
            maxLength={64}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{txa('Baslik')}</Label>
          <Input
            type="text"
            value={newFlagForm.label}
            onChange={(event) =>
              setNewFlagForm((prev) => ({ ...prev, label: event.target.value }))
            }
            maxLength={80}
          />
        </div>
        <div className="col-span-full flex flex-col gap-1.5">
          <Label>{txa('Açıklama')}</Label>
          <Textarea
            value={newFlagForm.description}
            onChange={(event) =>
              setNewFlagForm((prev) => ({
                ...prev,
                description: event.target.value,
              }))
            }
            rows={2}
            maxLength={400}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{txa('Rollout %')}</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={newFlagForm.rolloutPercent}
            onChange={(event) =>
              setNewFlagForm((prev) => ({
                ...prev,
                rolloutPercent: Math.min(
                  100,
                  Math.max(0, Number(event.target.value || 0)),
                ),
              }))
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={newFlagForm.isEnabled}
              onChange={(event) =>
                setNewFlagForm((prev) => ({
                  ...prev,
                  isEnabled: event.target.checked,
                }))
              }
            />
            {txa('Aktif')}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={newFlagForm.isPublic}
              onChange={(event) =>
                setNewFlagForm((prev) => ({
                  ...prev,
                  isPublic: event.target.checked,
                }))
              }
            />
            {txa('Public')}
          </Label>
        </div>
        <div className="col-span-full flex flex-wrap gap-2">
          <Button type="submit" disabled={creatingFlag}>
            {creatingFlag ? txa('Oluşturuluyor…') : txa('Bayrak oluştur')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setNewFlagForm(DEFAULT_NEW_FLAG_FORM)}
            disabled={creatingFlag}
          >
            {txa('Formu Sifirla')}
          </Button>
        </div>
      </form>
    </AdminSurface>
  )
}

