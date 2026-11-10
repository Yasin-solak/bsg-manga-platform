import type { Transition, Variants } from 'framer-motion'

// Shared motion language across the app. New animations should take duration and easing
// from here so the site moves to one rhythm.
// The reduced motion preference is applied automatically on the framer side by
// <MotionConfig reducedMotion="user"> at App level.

export const MOTION_DURATION = {
  fast: 0.15,
  base: 0.22,
  slow: 0.35,
} as const

export const MOTION_EASE = {
  // Fast out, soft landing: for UI entrances.
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const

export const motionTransition = {
  fast: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.out },
  base: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  slow: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  spring: { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 },
} satisfies Record<string, Transition>

export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: motionTransition.base },
  exit: { opacity: 0, transition: motionTransition.fast },
}

export const slideUpVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: motionTransition.base },
  exit: { opacity: 0, y: -8, transition: motionTransition.fast },
}

export const popVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: motionTransition.spring },
  exit: { opacity: 0, scale: 0.96, transition: motionTransition.fast },
}

// Staggered entrance for list/grid items; children can use slideUpVariants.
export const staggerContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
}

// Page transitions only animate opacity: giving the main wrapper a transform
// would make inner `position: fixed` / sticky elements (bottom bar, modal,
// top bar) drift to the wrong place during the animation.
export const pageEnterKeyframes = { opacity: [0, 1] }
export const pageEnterTransition: Transition = {
  duration: MOTION_DURATION.base,
  ease: MOTION_EASE.out,
}

// Child routes under the same parent section (/magaza -> /magaza/katalog)
// behave like tabs; we do not play page transitions on them.
export function getPageTransitionKey(pathname: string): string {
  const firstSegment = pathname.split('/').filter(Boolean)[0]
  return firstSegment ? `/${firstSegment}` : '/'
}
