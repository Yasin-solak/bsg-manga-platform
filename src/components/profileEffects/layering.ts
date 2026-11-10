/**
 * A profile effect plays IN FRONT of content on every surface (profile card, hover card, fansub card):
 * name, badge, buttons and text do not cover the effect. The layer passes clicks through
 * (pointer-events-none, ProfileEffectLayer); in-card dropdowns (z-[420])
 * still stay on top.
 */
export const PROFILE_EFFECT_TOP_LAYER = 'z-[60]'
