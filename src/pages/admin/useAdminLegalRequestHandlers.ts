import type { Dispatch, SetStateAction } from 'react'
import { listLegalRequests, updateLegalRequest, type LegalRequest, type UpdateLegalRequestInput } from '@/services/legalRequestService'
import { toast } from '@/services/toastService'
import { toErrorMessage } from './adminPageUtils'
import { txa } from '@/i18n/activeLocale'

interface UseAdminLegalRequestHandlersParams {
  setLegalRequests: Dispatch<SetStateAction<LegalRequest[]>>
}

export function useAdminLegalRequestHandlers({ setLegalRequests }: UseAdminLegalRequestHandlersParams) {
  async function refreshLegalRequests() {
    try {
      const data = await listLegalRequests()
      setLegalRequests(data)
    } catch (error) {
      toast.error(toErrorMessage(error, txa('Yasal talepler yenilenemedi.')))
    }
  }

  async function handleUpdateLegalRequest(input: UpdateLegalRequestInput) {
    try {
      await updateLegalRequest(input)
      const nextRequests = await listLegalRequests()
      setLegalRequests(nextRequests)
      toast.success(txa('Yasal talep güncellendi.'))
      return true
    } catch (error) {
      toast.error(toErrorMessage(error, txa('Yasal talep guncellenemedi.')))
      return false
    }
  }

  return {
    refreshLegalRequests,
    handleUpdateLegalRequest,
  }
}
