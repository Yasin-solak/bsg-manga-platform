/**
 * usePreventFileDropNavigation: prevents unwanted browser navigation caused by
 * file drops across the app.
 *
 * Why it is needed: if a user drags an image (cover/page) and drops it slightly outside the
 * target dropzone, the browser's DEFAULT behavior is to open that file, leaving
 * the SPA for the file's URL. When the user comes back the app reloads from scratch and
 * form data is lost, which is perceived as "the page
 * refreshed".
 *
 * Solution: at window level, in the CAPTURE phase, we call preventDefault for
 * file drags only. The capture phase matters: the guard runs even if a dropzone
 * calls stopPropagation in its own handler.
 * preventDefault only cancels the browser default; real dropzones'
 * own onDrop handlers (reading the file) keep working normally.
 *
 * Always bound at the App root, so on any page
 * a file dropped by accident never causes navigation.
 */
import { useEffect } from 'react'

export function usePreventFileDropNavigation(active = true) {
  useEffect(() => {
    if (!active) return

    const isFileDrag = (event: DragEvent) =>
      Boolean(event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files'))

    const handleDragOver = (event: DragEvent) => {
      if (isFileDrag(event)) event.preventDefault()
    }
    const handleDrop = (event: DragEvent) => {
      if (isFileDrag(event)) event.preventDefault()
    }

    window.addEventListener('dragover', handleDragOver, { capture: true })
    window.addEventListener('drop', handleDrop, { capture: true })
    return () => {
      window.removeEventListener('dragover', handleDragOver, { capture: true })
      window.removeEventListener('drop', handleDrop, { capture: true })
    }
  }, [active])
}
