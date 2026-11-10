import { useEffect } from 'react'
import { loadNameEffects } from '@/lib/nameEffectRegistry'

/** Loads CSS rules for animated name effects; mounted once in the app. */
export default function NameEffectStyles() {
  useEffect(() => { void loadNameEffects() }, [])
  return null
}
