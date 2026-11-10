import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { toUserFacingErrorMessage } from '../userFacingError'
import { getCurrentUserIdentity } from '../userService/selfIdentity'

const mangaListSharedAuthLogger = createScopedLogger('mangaListService.sharedAuth')

export async function getCurrentPublicUserId(): Promise<string | null> {
  const requestContext = createRequestContext('mangaListService.sharedAuth', 'get-current-public-user-id')
  try {
    const identity = await getCurrentUserIdentity()
    return identity?.id ?? null
  } catch (error) {
    mangaListSharedAuthLogger.warn({
      event: 'get-current-public-user-id-failed',
      message: toUserFacingErrorMessage(error, 'Kullanici profili cozulurken bir hata olustu.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return null
  }
}
