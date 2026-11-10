import { FansubModalBadgesTab } from './FansubModalBadgesTab'
import { FansubModalGeneralTab } from './FansubModalGeneralTab'
import { FansubModalInventoryTab } from './FansubModalInventoryTab'
import { FansubModalMangasTab } from './FansubModalMangasTab'
import { FansubModalMembersTab } from './FansubModalMembersTab'
import { FansubModalTabsHeader } from './FansubModalTabsHeader'
import type { FansubModalTabPanelsProps } from './FansubModalTabPanels.types'

export { FansubModalTabsHeader }
export type { ModalTab } from './FansubModalTabPanels.types'

export function FansubModalTabPanels({
  activeTab,
  isEdit,
  loading,
  uploading,
  name,
  description,
  avatar,
  previewFrame,
  presetAvatars,
  members,
  hasMemberChanges,
  chapters,
  activeMangaId,
  coinBalance,
  redeemCodeInput,
  inventory,
  activeItems,
  giftModalOpen,
  storeItems,
  ownedBadges,
  selectedBadgeIds,
  onGeneralSubmit,
  onNameChange,
  onAvatarFileChange,
  onPickAvatar,
  onDescriptionChange,
  onClose,
  onMemberRoleChange,
  onRemoveMember,
  onSaveMemberChanges,
  onToggleMangaGroup,
  onRemoveChapter,
  onRedeemCodeInputChange,
  onRedeemCode,
  onOpenGiftModal,
  onCloseGiftModal,
  onGiftItem,
  onGoStore,
  onEquipItem,
  onRemoveInventoryItem,
  getPatternPreview,
  getBackgroundPreview,
  onToggleBadge,
  onSaveBadges,
}: FansubModalTabPanelsProps) {
  return (
    <div className="fansub-modal-content" style={{ marginTop: '16px' }}>
      {activeTab === 'general' && (
        <FansubModalGeneralTab
          isEdit={isEdit}
          loading={loading}
          uploading={uploading}
          name={name}
          description={description}
          avatar={avatar}
          previewFrame={previewFrame}
          presetAvatars={presetAvatars}
          onSubmit={onGeneralSubmit}
          onNameChange={onNameChange}
          onAvatarFileChange={onAvatarFileChange}
          onPickAvatar={onPickAvatar}
          onDescriptionChange={onDescriptionChange}
          onClose={onClose}
        />
      )}

      {activeTab === 'members' && (
        <FansubModalMembersTab
          members={members}
          loading={loading}
          hasMemberChanges={hasMemberChanges}
          onRoleChange={onMemberRoleChange}
          onRemoveMember={onRemoveMember}
          onSaveMemberChanges={onSaveMemberChanges}
        />
      )}

      {activeTab === 'mangas' && (
        <FansubModalMangasTab
          chapters={chapters}
          activeMangaId={activeMangaId}
          onToggleMangaGroup={onToggleMangaGroup}
          onRemoveChapter={onRemoveChapter}
        />
      )}

      {activeTab === 'inventory' && (
        <FansubModalInventoryTab
          coinBalance={coinBalance}
          redeemCodeInput={redeemCodeInput}
          inventory={inventory}
          activeItems={activeItems}
          giftModalOpen={giftModalOpen}
          storeItems={storeItems}
          avatar={avatar}
          onRedeemCodeInputChange={onRedeemCodeInputChange}
          onRedeemCode={onRedeemCode}
          onOpenGiftModal={onOpenGiftModal}
          onCloseGiftModal={onCloseGiftModal}
          onGiftItem={onGiftItem}
          onGoStore={onGoStore}
          onEquipItem={onEquipItem}
          onRemoveInventoryItem={onRemoveInventoryItem}
          getPatternPreview={getPatternPreview}
          getBackgroundPreview={getBackgroundPreview}
        />
      )}

      {activeTab === 'badges' && (
        <FansubModalBadgesTab
          isEdit={isEdit}
          ownedBadges={ownedBadges}
          selectedBadgeIds={selectedBadgeIds}
          onToggleBadge={onToggleBadge}
          onSaveBadges={onSaveBadges}
        />
      )}
    </div>
  )
}
