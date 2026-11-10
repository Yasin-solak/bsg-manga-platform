import { redeemCoinCode } from '../redeemCodeService'

export async function redeemCode(userId: string, code: string) {
    const result = await redeemCoinCode({
        userId,
        code,
        target: 'user',
    })
    return result.newBalance
}
