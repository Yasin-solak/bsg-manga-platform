import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const userTypesSource = read('src/services/userService/types.ts')
const profilesSource = read('src/services/userService/profiles.ts')
const selfIdentitySource = read('src/services/userService/selfIdentity.ts')
const authTypesSource = read('src/services/authService/types.ts')
const authSharedSource = read('src/services/authService/shared.ts')
const authContextSource = read('src/contexts/AuthContext.tsx')
const authPageSource = read('src/pages/AuthPage.tsx')
const displayNameSource = read('src/lib/userDisplayName.ts')
const profileDialogSource = read('src/pages/profile/ProfileEditDialog.tsx')
const profileBasicsSource = read('src/pages/profile/ProfileEditBasicsSection.tsx')
const profileDisplayNameFieldSource = read('src/pages/profile/ProfileEditDisplayNameField.tsx')
const profileMutationSource = read('src/pages/profile/useProfileEditMutations.ts')
const profileLoaderSource = read('src/pages/profile/profilePageLoader.ts')
const profileShowcaseSource = read('src/pages/profile/ProfileIdentityShowcase.tsx')
const onboardingSource = read('src/pages/OnboardingPage.tsx')

assert.match(userTypesSource, /display_name: string/)
assert.match(profilesSource, /PROFILE_IDENTITY_SELECT = `[\s\S]*display_name/)
assert.match(profilesSource, /LEGACY_PROFILE_IDENTITY_SELECT[\s\S]*isDisplayNameProjectionUnavailable/)
assert.match(profilesSource, /row\?\.display_name[\s\S]*:\s*username/)
assert.match(profilesSource, /supabase\.rpc\('update_my_display_name', \{[\s\S]*p_display_name: normalizedDisplayName/)
assert.match(selfIdentitySource, /display_name: typeof row\.display_name[\s\S]*:\s*username/)

assert.match(authTypesSource, /display_name\?: string \| null/)
assert.match(authTypesSource, /displayName: string/)
assert.match(authSharedSource, /const displayName = typeof row\.display_name[\s\S]*:\s*row\.username/)
assert.match(authContextSource, /displayName: appUser\.displayName \|\| appUser\.username/)

assert.match(displayNameSource, /USER_DISPLAY_NAME_MIN_LENGTH = 1/)
assert.match(displayNameSource, /USER_DISPLAY_NAME_MAX_LENGTH = 40/)
assert.match(displayNameSource, /containsControlCharacter/)

assert.match(profileDialogSource, /<ProfileEditBasicsSection[\s\S]*draft=\{editDraft\}/)
assert.match(profileBasicsSource, /<ProfileEditDisplayNameField[\s\S]*value=\{draft\.displayName\}/)
assert.match(profileDisplayNameFieldSource, /htmlFor="profile-edit-display-name"[\s\S]*value=\{value\}/)
assert.match(profileDisplayNameFieldSource, /Bu ad benzersiz olmak zorunda değil/)
assert.match(profileMutationSource, /getProfileEditDisplayNameError\(editDraft\.displayName\)/)
assert.match(profileMutationSource, /userService\.updateMyDisplayName\(normalizedDisplayName\)/)
assert.match(profileLoaderSource, /displayName: profile\?\.display_name \|\| profileIdentity\.display_name/)
assert.match(profileShowcaseSource, /\{user\.displayName \|\| user\.username\}/)
assert.match(profileShowcaseSource, /@\{user\.username\}/)

/*
 * What the guard protects: the SIGNUP FORM asks for the unique handle, NOT THE DISPLAY
 * NAME; and users are told the two are different. The label text changed while
 * matching the prototype ("Benzersiz kullanıcı etiketi" -> "Kullanıcı adı"), so
 * the assertion is tied to the FIELD and the INFO given, not the text.
 */
assert.match(authPageSource, /id="auth-username"/)
assert.doesNotMatch(authPageSource, /id="auth-display-name"/)
assert.match(authPageSource, /Görünen adını profilinden ayrıca düzenleyebilirsin/)
/*
 * Usernames CANNOT be changed here (no updateMyUsername). If the prototype's
 * "sonradan değiştirebilirsin" sentence is copied, a promise that cannot be kept
 * is made.
 */
assert.doesNotMatch(authPageSource, /Kullanıcı adın[^']*sonradan değiştirebilirsin/)
assert.match(onboardingSource, /currentUser\.displayName \|\| currentUser\.username/)

console.log('user display name profile contract: OK')
