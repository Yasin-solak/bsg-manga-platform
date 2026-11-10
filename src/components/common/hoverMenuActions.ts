import type { MutableRefObject } from 'react'
import { clearHoverDelay } from './userHoverCardShared'

export function primeHoverActionMenuOpen({
  closeTimeoutRef,
  actionMenuOpenRef,
}: {
  closeTimeoutRef: MutableRefObject<number | null>
  actionMenuOpenRef: MutableRefObject<boolean>
}) {
  clearHoverDelay(closeTimeoutRef)
  actionMenuOpenRef.current = true
}

export function closeHoverActionMenu({
  actionMenuOpenRef,
  setIsActionMenuOpen,
}: {
  actionMenuOpenRef: MutableRefObject<boolean>
  setIsActionMenuOpen: (value: boolean) => void
}) {
  actionMenuOpenRef.current = false
  setIsActionMenuOpen(false)
}

export function syncHoverActionMenuOpenChange({
  nextOpen,
  actionMenuOpenRef,
  setIsActionMenuOpen,
  triggerRef,
  cardRef,
  scheduleClose,
}: {
  nextOpen: boolean
  actionMenuOpenRef: MutableRefObject<boolean>
  setIsActionMenuOpen: (value: boolean) => void
  triggerRef: MutableRefObject<HTMLElement | null>
  cardRef: MutableRefObject<HTMLElement | null>
  scheduleClose: () => void
}) {
  actionMenuOpenRef.current = nextOpen
  setIsActionMenuOpen(nextOpen)
  if (nextOpen) return

  const isHoveringTrigger = Boolean(triggerRef.current?.matches(':hover'))
  const isHoveringCard = Boolean(cardRef.current?.matches(':hover'))
  if (!isHoveringTrigger && !isHoveringCard) {
    scheduleClose()
  }
}
