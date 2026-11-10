import { authenticate, errorResponse, HttpError, methodNotAllowed, requireUuid, timed } from '../../_shared/translation-http.js'

/*
 * Admin chapter review: the RAW (or clean base) page image of a studio project.
 * Images live in private R2 (TYPESET_RAW_BUCKET). The server decides access:
 * tl_admin_page_object_key is called with the user's own JWT and returns a key
 * only for a site admin (app_private.is_admin); everyone else gets 403.
 */

const KEY_PATTERN = /^(pages|clean)\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(png|jpg|webp)$/

async function get(request, env, deps) {
  const url = new URL(request.url)
  const pageId = requireUuid(url.searchParams.get('page_id'), 'Sayfa kimliği')
  const kind = url.searchParams.get('kind') === 'clean' ? 'clean' : 'raw'
  const { db } = await authenticate(request, env, deps.createClient)
  const bucket = env?.TYPESET_RAW_BUCKET
  if (!bucket || typeof bucket.get !== 'function') throw new HttpError(503, 'Ham görsel deposu kullanılamıyor.')
  const { data: key, error } = await timed(db.rpc('tl_admin_page_object_key', { p_page_id: pageId, p_kind: kind }))
  if (error?.code === '42501') throw new HttpError(403, 'Ham sayfa yalnız site yöneticisine açık.')
  if (error) throw new HttpError(503, 'Sayfa okunamadı.')
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) throw new HttpError(404, 'Sayfa görseli yok.')
  const object = await bucket.get(key)
  if (!object?.body) throw new HttpError(404, 'Sayfa görseli depoda bulunamadı.')
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || 'image/webp',
      // Yetki her istekte yeniden denetlenir; paylasilan onbellege girmez.
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  })
}

export async function handleTranslationAdminPage(request, env, deps = {}) {
  try {
    return await get(request, env, deps)
  } catch (error) {
    return errorResponse(error)
  }
}

export const onRequestGet = ({ request, env }) => handleTranslationAdminPage(request, env)
export const onRequest = () => methodNotAllowed('GET')
