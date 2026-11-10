import { Input } from '@/components/ui/input'
import { truncateUserDisplayName } from '@/lib/userDisplayName'
import {
  PROFILE_EDIT_DISPLAY_NAME_MAX_LENGTH,
  sanitizeProfileEditDisplayName,
} from './profileEditForm'
import { txa } from '@/i18n/activeLocale'

type ProfileEditDisplayNameFieldProps = {
  disabled: boolean
  onChange: (value: string) => void
  username: string
  value: string
}

export default function ProfileEditDisplayNameField({
  disabled,
  onChange,
  username,
  value,
}: ProfileEditDisplayNameFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor="profile-edit-display-name" className="text-sm font-semibold text-foreground">{txa('Görünen ad')}</label>
      <Input
        id="profile-edit-display-name"
        type="text"
        autoComplete="name"
        value={value}
        onChange={(event) => onChange(truncateUserDisplayName(event.target.value))}
        onBlur={(event) => onChange(sanitizeProfileEditDisplayName(event.target.value))}
        aria-describedby="profile-edit-display-name-help"
        disabled={disabled}
      />
      <div id="profile-edit-display-name-help" className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
        <span>{txa('Bu ad benzersiz olmak zorunda değil. Profil adresin ve bahsetme etiketin @{v1} olarak kalır.', { v1: username })}</span>
        <span className="shrink-0">{Array.from(value).length}/{PROFILE_EDIT_DISPLAY_NAME_MAX_LENGTH}</span>
      </div>
    </div>
  )
}
