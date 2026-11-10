import { expect, test } from '@playwright/test'

test('the manual brush cleans missed SFX ink from the publish base', async ({ page }) => {
  await page.goto('/tr')
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/studioV2CleanBase.ts'
    const { renderStudioV2CleanPage } = await import(/* @vite-ignore */ modulePath)
    const raw = document.createElement('canvas')
    raw.width = 32
    raw.height = 32
    const context = raw.getContext('2d')!
    context.fillStyle = '#c8c8c8'
    context.fillRect(0, 0, 32, 32)
    context.fillStyle = '#000'
    context.fillRect(14, 14, 4, 4)
    const rawBlob = await new Promise<Blob>((resolve) => raw.toBlob((blob) => resolve(blob!), 'image/png'))

    async function render(maskStrokes: Array<{ type: 'mask_stroke'; points: Array<{ x: number; y: number }>; radius: number }>) {
      let output: Blob | null = null
      await renderStudioV2CleanPage({
        rawBlob, rawWidth: 32, rawHeight: 32, regions: [], maskStrokes, startPageIndex: 0,
        onSegment: async (segment: { blob: Blob }) => { output = segment.blob },
      })
      if (!output) throw new Error('No publish part was produced.')
      const bitmap = await createImageBitmap(output)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const outputContext = canvas.getContext('2d')!
      outputContext.drawImage(bitmap, 0, 0)
      bitmap.close()
      return outputContext.getImageData(16, 16, 1, 1).data[0]
    }

    return {
      before: await render([]),
      after: await render([{ type: 'mask_stroke', points: [{ x: 16, y: 16 }], radius: 5 }]),
    }
  })
  expect(result.before).toBeLessThan(20)
  expect(result.after).toBeGreaterThan(120)
})
