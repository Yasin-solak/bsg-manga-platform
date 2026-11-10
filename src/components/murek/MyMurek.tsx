import { useAuth } from '@/contexts/AuthContext'
import { useMyMurekLook } from '@/hooks/useMyMurekLook'
import { Murek, type MurekMood, type MurekMotion } from './Murek'

/* The Mürek the signed-in user equipped from the Mürek Closet (color + accessory). */
export function MyMurek(props: { mood?: MurekMood, motion?: MurekMotion, size?: number, className?: string, title?: string }) {
  const { currentUser } = useAuth()
  const look = useMyMurekLook(currentUser?.id)
  return <Murek {...props} color={look.colorHex} accessory={look.accessory} animated={look.animated} />
}
