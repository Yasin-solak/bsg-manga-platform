import { handleStorageUpload } from '../../_shared/storage-upload-r2'

export async function onRequestPost(context) {
  return handleStorageUpload(context.request, context.env)
}

export function onRequest() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      allow: 'POST',
      'cache-control': 'no-store',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
    },
  })
}
