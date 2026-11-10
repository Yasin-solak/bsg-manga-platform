/**
 * Boost + donation dialogs opening inside the chapter.
 *
 * The SAME components as the fansub page are used (BoostPurchaseDialog /
 * FansubDonateDialog): two separate purchase surfaces would mean maintenance load and behavior
 * drift. The only difference here is where state comes from.
 *
 * Dialogs must draw above the reader shell (z-9000); the Dialog component uses a
 * portal, so this is automatic.
 */

import FansubDonateDialog from '@/components/fansub/FansubDonateDialog'
import { BoostPurchaseDialog } from '@/pages/fansub/FansubBoostDialogs'
import type { useReaderV2Support } from '@/pages/reader/useReaderV2Support'

interface ReaderV2SupportDialogsProps {
  support: ReturnType<typeof useReaderV2Support>
  fansubName: string
}

export function ReaderV2SupportDialogs({ support, fansubName }: ReaderV2SupportDialogsProps) {
  return (
    <>
      {support.canBoost ? (
        <BoostPurchaseDialog
          open={support.boost.open}
          onOpenChange={support.boost.setOpen}
          fansubName={fansubName}
          plan={support.boost.plan}
          quantity={support.boost.quantity}
          onQuantityChange={support.boost.setQuantity}
          currentUserCoins={support.currentUserCoins}
          supporterNote={support.boost.supporterNote}
          onSupporterNoteChange={support.boost.setSupporterNote}
          isSubmitting={support.boost.isSubmitting}
          onSubmit={() => void support.boost.submit()}
          progress={support.boost.progress}
        />
      ) : null}

      {support.canDonate ? (
        <FansubDonateDialog
          open={support.donate.open}
          saving={support.donate.isSubmitting}
          fansubName={fansubName}
          currentUserCoins={support.currentUserCoins}
          amountInput={support.donate.amountInput}
          note={support.donate.note}
          confirmationInput={support.donate.confirmationInput}
          isConfirmationValid={support.donate.isConfirmationValid}
          normalizedAmount={support.donate.normalizedAmount}
          onAmountInputChange={support.donate.setAmountInput}
          onNoteChange={support.donate.setNote}
          onConfirmationInputChange={support.donate.setConfirmationInput}
          onAmountPresetSelect={(value) => support.donate.setAmountInput(String(value))}
          onOpenChange={(open) => {
            if (support.donate.isSubmitting) return
            support.donate.setOpen(open)
          }}
          onCancel={() => support.donate.setOpen(false)}
          onSubmit={() => void support.donate.submit()}
        />
      ) : null}
    </>
  )
}

export default ReaderV2SupportDialogs
