import { parseErrorMessage } from './shared'

export function toRewardErrorMessage(error: unknown, fallback: string) {
  return parseErrorMessage(error, fallback)
}
