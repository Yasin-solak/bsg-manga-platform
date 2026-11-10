import type { ReactNode } from 'react'
import { DiscordLogo, InstagramLogo, XLogo } from '@phosphor-icons/react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  normalizeProfileSocialHandle,
  PROFILE_EDIT_BIO_MAX_LENGTH,
} from './profileEditForm'
import ProfileEditDisplayNameField from './ProfileEditDisplayNameField'
import type { MockUser, ProfileEditDraft } from './types'
import { txa } from '@/i18n/activeLocale'

const SOCIAL_FIELDS: Array<{
  icon: ReactNode
  key: 'discord' | 'instagram' | 'x'
  label: string
  placeholder: string
}> = [
  { key: 'discord', get label() { return txa('Discord') }, get placeholder() { return txa('kullaniciadi') }, icon: <DiscordLogo weight="fill" className="size-4" /> },
  { key: 'instagram', get label() { return txa('Instagram') }, get placeholder() { return txa('kullaniciadi') }, icon: <InstagramLogo weight="fill" className="size-4" /> },
  { key: 'x', label: 'X', get placeholder() { return txa('kullaniciadi') }, icon: <XLogo weight="bold" className="size-4" /> },
]

type ProfileEditBasicsSectionProps = {
  draft: ProfileEditDraft
  onAvatarEdit: () => void
  onDraftChange: (patch: Partial<ProfileEditDraft>) => void
  previewUser: MockUser
  saving: boolean
  user: MockUser
}

export default function ProfileEditBasicsSection({
  draft,
  onAvatarEdit,
  onDraftChange,
  previewUser,
  saving,
  user,
}: ProfileEditBasicsSectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-14 shrink-0 overflow-hidden rounded-full border border-border bg-card">
          <img loading="lazy" decoding="async" src={previewUser.avatar} alt={txa('Avatar önizleme')} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-black text-foreground">{previewUser.displayName || user.username}</p>
          <p className="m-0 truncate text-xs text-muted-foreground">@{user.username}</p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {txa('Avatar ve arka planı sağdaki önizleme üzerindeki butonlardan da değiştirebilirsin.')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          disabled={saving}
          onClick={onAvatarEdit}
        >
          <Upload className="mr-1.5 size-3.5" />
          {txa('Avatar')}
        </Button>
      </div>

      <ProfileEditDisplayNameField
        disabled={saving}
        onChange={(displayName) => onDraftChange({ displayName })}
        username={user.username}
        value={draft.displayName}
      />

      <div className="space-y-2">
        <label htmlFor="profile-edit-bio" className="text-sm font-semibold text-foreground">{txa('Hakkinda')}</label>
        <Textarea
          id="profile-edit-bio"
          rows={3}
          value={draft.bio}
          onChange={(event) => onDraftChange({ bio: event.target.value.slice(0, PROFILE_EDIT_BIO_MAX_LENGTH) })}
          placeholder={txa('Kendini bir iki paragrafla anlat. Profil girer girmez nasıl bir izlenim vermek istediğini düşün.')}
          className="min-h-[78px]"
          disabled={saving}
        />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{txa('Bu metin profil vitrininin hakkında alanında görünür.')}</span>
          <span>{draft.bio.length}/{PROFILE_EDIT_BIO_MAX_LENGTH}</span>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/40 pt-5">
        <div>
          <h3 className="m-0 text-sm font-black text-foreground">{txa('Dış bağlantılar')}</h3>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">{txa('Profilinde görünecek sosyal hesaplar.')}</p>
        </div>
        <div className="space-y-2">
          {SOCIAL_FIELDS.map((field) => (
            <div key={field.key} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2">
              <label htmlFor={`profile-edit-${field.key}`} className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border/60 text-foreground/85" title={field.label} aria-label={field.label}>
                <span aria-hidden="true">{field.icon}</span>
              </label>
              <Input
                id={`profile-edit-${field.key}`}
                type="text"
                value={draft[field.key]}
                onChange={(event) => onDraftChange({ [field.key]: event.target.value } as Partial<ProfileEditDraft>)}
                onBlur={(event) => onDraftChange({ [field.key]: normalizeProfileSocialHandle(event.target.value) } as Partial<ProfileEditDraft>)}
                placeholder={field.placeholder}
                aria-label={txa('{v1} kullanıcı adı', { v1: field.label })}
                maxLength={48}
                disabled={saving}
                className="h-9"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
