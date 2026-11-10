export type Preferences = { reduceMotion: boolean; animateFrames: boolean }
export const defaults: Preferences = { reduceMotion: false, animateFrames: true }
export function normalizeDesktopAppearance(value: unknown): Preferences {
  const data = value && typeof value === 'object' ? value as Partial<Preferences> : {}
  return { reduceMotion: typeof data.reduceMotion === 'boolean' ? data.reduceMotion : false, animateFrames: typeof data.animateFrames === 'boolean' ? data.animateFrames : true }
}
