import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The fansub showcase has the same customization as the user profile: theme v2 (color + scene style + pattern),
// name style v2 (motion / fill / effect color), a 380 x 640 card and a themed card body. The server
// stores the theme as v2 (only two colors were written before; on the user profile too).
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const sql = read('supabase/migrations/20261013120000_profile_theme_v2.sql')
assert.match(sql, /create or replace function app_private\.normalize_profile_theme\(p_theme jsonb\)/, 'shared theme normalization')
assert.match(sql, /'version', 2,/, 'theme v2 is stored')
assert.match(sql, /p_theme ->> 'style' in \('aurora', 'gradient', 'spotlight', 'mesh'\)/, 'bilinmeyen stil kabul edilmez')
assert.match(sql, /p_theme ->> 'pattern' in \('none', 'dots', 'grid', 'stars', 'waves', 'noise'\)/, 'bilinmeyen desen kabul edilmez')
assert.match(sql, /'app_private\.normalize_profile_theme\(v_patch_active_hover_theme\)'/, 'user record v2')
assert.match(sql, /'app_private\.normalize_profile_theme\(p_hover_theme\)'/, 'fansub kaydi v2')
assert.match(sql, /raise exception 'upsert_fansub_profile: v1 tema kurucusu bulunamadi'/, 'yama tutmazsa migration durur')

assert.match(read('src/services/fansubService/catalog.ts'), /active_name_style,\n {2}hover_theme,/, 'the detail query fetches the theme (otherwise save deleted the theme)')
assert.match(read('src/services/fansubService/shared.mappers.ts'), /hoverTheme: parseProfileTheme\(row\.hover_theme\)/, 'theme v2 is read')

const hero = read('src/pages/fansub/FansubShowcaseHero.tsx')
assert.match(hero, /export const FANSUB_SHOWCASE_WIDTH_PX = 380/, 'the card has the same width as the profile card')
assert.match(hero, /style=\{buildHoverCardThemeStyle\(\n\s+themeColors,/, 'the card body paints with the theme')

const modal = read('src/components/fansub/FansubEditModal.tsx')
assert.match(modal, /<ProfileThemePicker\n/, 'the fansub uses the profile theme picker')
assert.match(modal, /<UserNameStyleStudio\n/, 'the fansub uses the new name studio')
assert.doesNotMatch(modal, /<NameStylePickerPanel|<HoverThemePicker/, 'old pickers do not come back')
assert.match(modal, /value=\{hasHoverThemeAccess \? editDraft\.hoverTheme : null\}/, 'theme is tied to boost')

const nameStyle = read('src/pages/fansub/fansubNameStyle.ts')
assert.match(nameStyle, /return \{ version: 2 as const, \.\.\.ids, \.\.\.fx \}/, 'name style v2 record')
assert.match(nameStyle, /const style = normalizeUserNameTextStyle\(raw\)/, 'old v1 records convert')
assert.match(read('src/pages/fansub/fansubDetailMutationHelpers.ts'), /const nextActiveNameStyle = hasNameTextAccess\n\s+\? buildFansubActiveNameStyle\(/, 'without permission the saved style is kept')
assert.match(read('src/pages/fansub/useFansubDetailDerived.ts'), /resolveVisibleFansubNameStyle\(\n\s+fansub\?\.activeNameStyle,/, 'name style goes through the boost gate')

// The rest of the site (catalog, hover card, reader closing strip, community posts) takes the same
// v2 rendering from a shared helper; the visible style comes from the server's boost gate.
const sharedName = read('src/components/common/fansubNameStyle.ts')
assert.match(sharedName, /buildUserNameStyleProps\(hasActiveStyle \? normalizeUserNameTextStyle\(activeNameStyle\) : null\)/, 'ortak fansub adi cizimi v2')
const visibleSql = read('supabase/migrations/20261013160000_fansub_visible_name_style.sql')
assert.match(visibleSql, /create or replace function public\.visible_name_style\(p_fansub public\.fansubs\)/, 'computed field')
assert.match(visibleSql, /\(s\.capabilities ->> 'hasFullNameStyle'\)::boolean/, 'style only if boost is on')

console.log('PASS Fansub theme v2 + name style v2 + 380 card + shared v2 name drawing across the site')
