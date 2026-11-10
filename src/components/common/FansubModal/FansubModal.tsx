import { useState, useEffect } from 'react'
import { Fansub } from '@/types'
import { StoreItem } from '@/data/storeProducts'
import { supabase } from '@/services/supabase'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext, toRequestContextLogContext, type RequestContext } from '@/services/requestContext'
import { reportUserFacingError } from '@/services/userFacingError'
import { type FrameType } from '@components/common/AvatarFrame'
import { toast } from '@/services/toastService'
import { confirmDialog } from '@/services/confirmService'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

import {
    listFansubInventory,
    addFansubInventoryItem,
    removeFansubInventoryItem,
    getFansubMembers,
    redeemCode,

    equipPurchasedItem,
    updateMemberRole,
    removeFansubMember,
    listFansubChapters,
    removeChapter,
    uploadAvatar
} from '@/services/fansubService'
import { getFansubBadges, updateFansubDisplayedBadges, type FansubBadge } from '@/services/badgeService'
import {
    FansubModalTabPanels,
    FansubModalTabsHeader,
    type ModalTab,
} from './FansubModalTabPanels'
import './fansubModal.css'
import { txa, getActiveLocale } from '@/i18n/activeLocale'
import { localizeHref } from '@/i18n/localizedRoutes'

const fansubModalLogger = createScopedLogger('FansubModal')

function logFansubModalWarning(
    requestContext: RequestContext,
    message: string,
    error: unknown,
    extraContext?: Record<string, unknown>,
) {
    fansubModalLogger.warn({
        event: requestContext.event,
        message,
        context: toRequestContextLogContext(requestContext, extraContext),
        error,
    })
}

interface FansubModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: Partial<Fansub> & { name: string }) => Promise<void>
    editItem: Fansub | null
    storeItems?: StoreItem[]
    onUpdate?: () => void
}

export function FansubModal({ isOpen, onClose, onSave, editItem, storeItems = [], onUpdate }: FansubModalProps) {
    const isEdit = !!editItem
    const [activeTab, setActiveTab] = useState<ModalTab>('general')

    // Form fields
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [avatar, setAvatar] = useState('')
    const [primaryColor, setPrimaryColor] = useState('')
    const [secondaryColor, setSecondaryColor] = useState('')

    // Data states
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [inventory, setInventory] = useState<any[]>([])
    // Initial member state for diffing
    const [initialMembers, setInitialMembers] = useState<any[]>([])
    const [hasMemberChanges, setHasMemberChanges] = useState(false)
    const [members, setMembers] = useState<any[]>([])
    const [chapters, setChapters] = useState<any[]>([]) // Chapters functionality
    const [activeMangaId, setActiveMangaId] = useState<string | null>(null) // Accordion state

    // Badge state
    const [ownedBadges, setOwnedBadges] = useState<FansubBadge[]>([])
    const [selectedBadgeIds, setSelectedBadgeIds] = useState<string[]>([])


    // Economy state
    const [redeemCodeInput, setRedeemCodeInput] = useState('')
    const [giftModalOpen, setGiftModalOpen] = useState(false)
    const [activeItems, setActiveItems] = useState<{ frame?: string, background?: string, pattern?: string }>({})

    // Live Preview State (for immediate feedback)
    const [previewFrame, setPreviewFrame] = useState<FrameType>('default')
    const [_previewBg, setPreviewBg] = useState<string>('')
    const [_previewPattern, setPreviewPattern] = useState<string>('')

    // Helpers for preview (copied from StorePage)
    const getPatternPreview = (patternName?: string) => {
        const patternStyles: Record<string, string> = {
            dots: 'radial-gradient(circle, var(--legacy-black) 2px, transparent 2px)',
            stripes: 'repeating-linear-gradient(90deg, var(--legacy-black) 0, var(--legacy-black) 2px, transparent 2px, transparent 20px)',
            grid: 'linear-gradient(var(--legacy-black) 1px, transparent 1px), linear-gradient(90deg, var(--legacy-black) 1px, transparent 1px)',
            halftone: 'radial-gradient(circle at 20% 80%, var(--legacy-black) 2px, transparent 2px), radial-gradient(circle at 80% 20%, var(--legacy-black) 2px, transparent 2px)',
            zigzag: 'repeating-linear-gradient(45deg, var(--legacy-black) 0, var(--legacy-black) 10px, transparent 10px, transparent 20px)',
            waves: 'repeating-linear-gradient(0deg, var(--legacy-black) 0, var(--legacy-black) 2px, transparent 2px, transparent 8px)',
        }
        return patternStyles[patternName || ''] || patternStyles.dots
    }

    const getBackgroundPreview = (bgName?: string) => {
        const bgStyles: Record<string, string> = {
            space: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
            city: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #7e8ba3 100%)',
            nature: 'linear-gradient(135deg, #134e5e 0%, #71b280 50%, #a8e6cf 100%)',
            ocean: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #4facfe 100%)',
            sunset: 'linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%)',
            neon: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        }
        return bgStyles[bgName || ''] || bgStyles.space
    }

    // Handlers
    const handleRedeemCode = async () => {
        if (!editItem || !redeemCodeInput) return
        try {
            await redeemCode(editItem.id, redeemCodeInput)
            toast.success(txa('Kod başarıyla kullanıldı! Coin eklendi.'))
            setRedeemCodeInput('')
            loadFansubData(editItem.id)
        } catch (error) {
            const requestContext = createRequestContext('FansubModal', 'redeem-code', {
                fansubId: editItem.id,
                hasCode: Boolean(redeemCodeInput.trim()),
            })
            const reportedError = reportUserFacingError(fansubModalLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Kod kullanılamadı.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }



    const handleEquip = async (item: any) => {
        if (!editItem) return
        try {
            await equipPurchasedItem(editItem.id, item.storeItemId, item.type)

            // Update local state for immediate feedback
            setActiveItems(prev => ({
                ...prev,
                [item.type]: item.storeItemId
            }))

            // Update visual preview
            if (item.type === 'frame') setPreviewFrame(item.image as FrameType)
            if (item.type === 'background') setPreviewBg(item.image) // Assuming image is the style/id
            if (item.type === 'pattern') setPreviewPattern(item.image)

            toast.success(txa('{v1} başarıyla kuşanıldı!', { v1: item.name }))

            // Trigger parent update
            if (onUpdate) onUpdate()

        } catch (error) {
            const requestContext = createRequestContext('FansubModal', 'equip-fansub-item', {
                fansubId: editItem.id,
                storeItemId: item.storeItemId,
                itemType: item.type,
            })
            const reportedError = reportUserFacingError(fansubModalLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Kuşanma işlemi tamamlanamadı.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }

    // Reset or populate form when opening/changing item
    useEffect(() => {
        if (isOpen) {
            setActiveTab('general')
            if (editItem) {
                setName(editItem.name)
                setDescription(editItem.description || '')
                setAvatar(editItem.avatar)
                setPrimaryColor(editItem.primaryColor || '#000000')
                setSecondaryColor(editItem.secondaryColor || '#FFFFFF')

                // Initialize preview states
                setPreviewFrame((editItem as any).frameType || 'default') // Assuming editItem might have frameType
                // Note: editItem.activeBackgroundId etc. might not be in the base object unless fetched
                // We rely on loadFansubData to update these if possible, or defaults.

                loadFansubData(editItem.id)
            } else {
                setName('')
                setDescription('')
                setAvatar('')
                setPrimaryColor('#000000')
                setSecondaryColor('#FFFFFF')
                setPreviewFrame('default')
                setPreviewBg('')
                setPreviewPattern('')
                setInventory([])
                setMembers([])
                setChapters([])
            }
        }
    }, [isOpen, editItem])

    const loadFansubData = async (id: string) => {
        const requestContext = createRequestContext('FansubModal', 'load-fansub-data', {
            fansubId: id,
        })
        try {
            const [inv, mem] = await Promise.all([
                listFansubInventory(id),
                getFansubMembers(id)
            ])
            setInventory(inv)
            setMembers(mem)
            setInitialMembers(JSON.parse(JSON.stringify(mem))) // Initialize initialMembers here

            // Fetch active items
            const { data: fansubData } = await supabase
                .from('fansubs')
                .select('active_frame_id, active_background_id, active_pattern_id')
                .eq('id', id)
                .single()

            if (fansubData) {
                setActiveItems({
                    frame: fansubData.active_frame_id,
                    background: fansubData.active_background_id,
                    pattern: fansubData.active_pattern_id
                })

                // Also update visual previews if we have map of ID -> Type
                // Since we store ID in active_*, we need to know the 'type/value' (e.g. 'gold') to render AvatarFrame
                // Usually store_items.image_key holds this value. We need to find the item in inventory matching the active ID.

                const frameItem = inv.find((i: any) => i.storeItemId === fansubData.active_frame_id)
                if (frameItem) setPreviewFrame(frameItem.image as FrameType)

                const bgItem = inv.find((i: any) => i.storeItemId === fansubData.active_background_id)
                if (bgItem) setPreviewBg(bgItem.image)

                const patternItem = inv.find((i: any) => i.storeItemId === fansubData.active_pattern_id)
                if (patternItem) setPreviewPattern(patternItem.image)
            }

            // Fetch chapters
            const chaps = await listFansubChapters(id)
            setChapters(chaps)

            // Fetch badges
            try {
                const badges = await getFansubBadges(id)
                setOwnedBadges(badges)
                const displayedIds = badges
                    .filter(b => b.is_displayed)
                    .sort((a, b) => a.display_order - b.display_order)
                    .map(b => b.badge_id)
                setSelectedBadgeIds(displayedIds)
            } catch (badgeErr) {
                logFansubModalWarning(
                    requestContext,
                    'fansub rozetleri y?klenemedi.',
                    badgeErr,
                )
            }
        } catch (error) {
            const reportedError = reportUserFacingError(fansubModalLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Fansub verileri yüklenemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }





    const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return
        const file = e.target.files[0]

        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if (!validTypes.includes(file.type)) {
            toast.warning(txa('Sadece resim dosyaları (JPG, PNG, GIF, WEBP) yüklenebilir.'))
            return
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.warning(txa('Dosya boyutu 2MB\'dan küçük olmalıdır.'))
            return
        }

        try {
            setUploading(true)
            const url = await uploadAvatar(file, editItem?.id)
            setAvatar(url)
        } catch (error) {
            const requestContext = createRequestContext('FansubModal', 'upload-avatar', {
                fansubId: editItem?.id || null,
                fileType: file.type,
                fileSize: file.size,
            })
            const reportedError = reportUserFacingError(fansubModalLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Avatar yüklenemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        } finally {
            setUploading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        setLoading(true)
        try {
            await onSave({
                id: editItem?.id,
                name: name.trim(),
                description: description.trim(),
                avatar: avatar.trim(),
                primaryColor: primaryColor.trim(),
                secondaryColor: secondaryColor.trim(),
            })
            onClose()
        } catch (error) {
            const requestContext = createRequestContext('FansubModal', 'save-fansub', {
                fansubId: editItem?.id || null,
                isEdit,
                hasAvatar: Boolean(avatar.trim()),
            })
            const reportedError = reportUserFacingError(fansubModalLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Fansub kaydedilemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        } finally {
            setLoading(false)
        }
    }

    const handleGiftItem = async (itemId: string) => {
        if (!editItem) return
        const confirmed = await confirmDialog({
            title: txa('Eşyayı Hediye Et'),
            message: txa('Bu eşyayı fansuba hediye etmek istiyor musunuz?'),
            confirmText: txa('Hediye Et'),
            cancelText: txa('Vazgeç'),
            variant: 'warning',
        })
        if (!confirmed) return

        try {
            await addFansubInventoryItem(editItem.id, itemId)
            const updatedInv = await listFansubInventory(editItem.id)
            setInventory(updatedInv)
            setGiftModalOpen(false)
            toast.success(txa('Eşya hediye edildi!'))
        } catch (error) {
            const requestContext = createRequestContext('FansubModal', 'gift-fansub-item', {
                fansubId: editItem.id,
                storeItemId: itemId,
            })
            const reportedError = reportUserFacingError(fansubModalLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Eşya fansuba hediye edilemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }

    const handleRemoveItem = async (itemId: string) => {
        if (!editItem) return
        const confirmed = await confirmDialog({
            title: txa('Envanterden Sil'),
            message: txa('Bu eşyayı fansub envanterinden silmek istediğinize emin misiniz?'),
            confirmText: txa('Sil'),
            cancelText: txa('Vazgeç'),
            variant: 'danger',
        })
        if (!confirmed) return
        try {
            await removeFansubInventoryItem(editItem.id, itemId)
            setInventory(inventory.filter(i => i.storeItemId !== itemId))
        } catch (error) {
            const requestContext = createRequestContext('FansubModal', 'remove-fansub-inventory-item', {
                fansubId: editItem.id,
                storeItemId: itemId,
            })
            const reportedError = reportUserFacingError(fansubModalLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Envanter öğesi silinemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }

    const handleMemberRoleChange = (memberId: string, newRole: string) => {
        setMembers((prev) => prev.map((member) => (
            member.id === memberId ? { ...member, role: newRole } : member
        )))
        setHasMemberChanges(true)
    }

    const handleRemoveMember = async (member: { id: string; username: string }) => {
        if (!editItem) return
        const confirmed = await confirmDialog({
            title: txa('Üyeyi Çıkar'),
            message: txa('{v1} adlı üyeyi çıkarmak istediğinize emin misiniz?', { v1: member.username }),
            confirmText: txa('Çıkar'),
            cancelText: txa('Vazgeç'),
            variant: 'danger',
        })
        if (!confirmed) return

        try {
            await removeFansubMember(editItem.id, member.id)
            setMembers((prev) => prev.filter((row) => row.id !== member.id))
            setInitialMembers((prev) => prev.filter((row) => row.id !== member.id))
            setHasMemberChanges(false)
        } catch (error) {
            const requestContext = createRequestContext('FansubModal', 'remove-fansub-member', {
                fansubId: editItem.id,
                memberId: member.id,
            })
            const reportedError = reportUserFacingError(fansubModalLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Üye kaldırılamadı.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }

    const handleSaveMemberChanges = async () => {
        if (!editItem) return
        try {
            setLoading(true)
            const promises: Promise<any>[] = []

            members.forEach((member) => {
                const original = initialMembers.find((initial) => initial.id === member.id)
                if (original && original.role !== member.role) {
                    promises.push(updateMemberRole(editItem.id, member.id, member.role))
                }
            })

            await Promise.all(promises)
            setInitialMembers(JSON.parse(JSON.stringify(members)))
            setHasMemberChanges(false)
            toast.success(txa('Üye rolleri güncellendi!'))
        } catch (error) {
            const requestContext = createRequestContext('FansubModal', 'save-member-role-changes', {
                fansubId: editItem.id,
                memberCount: members.length,
            })
            const reportedError = reportUserFacingError(fansubModalLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Üye rolleri kaydedilemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        } finally {
            setLoading(false)
        }
    }

    const handleToggleMangaGroup = (mangaId: string) => {
        setActiveMangaId((prev) => (prev === mangaId ? null : mangaId))
    }

    const handleRemoveChapter = async (chapter: { id: string; chapter_number: number }) => {
        const confirmed = await confirmDialog({
            title: txa('Bölümü Sil'),
            message: txa('Bölüm {v1} silinsin mi?', { v1: chapter.chapter_number }),
            confirmText: txa('Sil'),
            cancelText: txa('Vazgeç'),
            variant: 'danger',
        })
        if (!confirmed) return

        try {
            await removeChapter(chapter.id)
            setChapters((prev) => prev.filter((row) => row.id !== chapter.id))
        } catch (error) {
            const requestContext = createRequestContext('FansubModal', 'remove-fansub-chapter', {
                chapterId: chapter.id,
                chapterNumber: chapter.chapter_number,
            })
            const reportedError = reportUserFacingError(fansubModalLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Bölüm silinemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }

    const handleGoStore = () => {
        onClose()
        window.location.href = localizeHref('/magaza', getActiveLocale())
    }

    const handleToggleBadge = (badgeId: string) => {
        setSelectedBadgeIds((prev) => {
            if (prev.includes(badgeId)) return prev.filter((id) => id !== badgeId)
            if (prev.length >= 3) return prev
            return [...prev, badgeId]
        })
    }

    const handleSaveBadges = async () => {
        if (!editItem) return
        try {
            await updateFansubDisplayedBadges(editItem.id, selectedBadgeIds)
            toast.success(txa('Rozetler kaydedildi!'))
            onUpdate?.()
        } catch (error) {
            const requestContext = createRequestContext('FansubModal', 'save-fansub-badges', {
                fansubId: editItem.id,
                selectedBadgeCount: selectedBadgeIds.length,
            })
            const reportedError = reportUserFacingError(fansubModalLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Rozetler kaydedilemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }

    // Default avatars for quick selection
    const PRESET_AVATARS = [
        'https://api.dicebear.com/7.x/bottts/svg?seed=gecekusu',
        'https://api.dicebear.com/7.x/bottts/svg?seed=ates',
        'https://api.dicebear.com/7.x/bottts/svg?seed=bulut',
        'https://api.dicebear.com/7.x/bottts/svg?seed=moon',
        'https://api.dicebear.com/7.x/bottts/svg?seed=sun',
    ]

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <DialogContent className="max-h-[92vh] p-0 sm:max-w-4xl">
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle>{isEdit ? `Fansub: ${editItem.name}` : txa('Yeni Fansub Ekle')}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[78vh] px-6 py-4">
                    <FansubModalTabsHeader
                        activeTab={activeTab}
                        isEdit={isEdit}
                        membersCount={members.length}
                        chaptersCount={chapters.length}
                        inventoryCount={inventory.length}
                        badgesCount={ownedBadges.length}
                        onTabChange={setActiveTab}
                    />

                    <FansubModalTabPanels
                        activeTab={activeTab}
                        isEdit={isEdit}
                        loading={loading}
                        uploading={uploading}
                        name={name}
                        description={description}
                        avatar={avatar}
                        previewFrame={previewFrame}
                        presetAvatars={PRESET_AVATARS}
                        members={members}
                        hasMemberChanges={hasMemberChanges}
                        chapters={chapters}
                        activeMangaId={activeMangaId}
                        coinBalance={editItem?.coinBalance ?? 0}
                        redeemCodeInput={redeemCodeInput}
                        inventory={inventory}
                        activeItems={activeItems}
                        giftModalOpen={giftModalOpen}
                        storeItems={storeItems}
                        ownedBadges={ownedBadges}
                        selectedBadgeIds={selectedBadgeIds}
                        onGeneralSubmit={handleSubmit}
                        onNameChange={setName}
                        onAvatarFileChange={handleAvatarFile}
                        onPickAvatar={setAvatar}
                        onDescriptionChange={setDescription}
                        onClose={onClose}
                        onMemberRoleChange={handleMemberRoleChange}
                        onRemoveMember={handleRemoveMember}
                        onSaveMemberChanges={handleSaveMemberChanges}
                        onToggleMangaGroup={handleToggleMangaGroup}
                        onRemoveChapter={handleRemoveChapter}
                        onRedeemCodeInputChange={setRedeemCodeInput}
                        onRedeemCode={handleRedeemCode}
                        onOpenGiftModal={() => setGiftModalOpen(true)}
                        onCloseGiftModal={() => setGiftModalOpen(false)}
                        onGiftItem={handleGiftItem}
                        onGoStore={handleGoStore}
                        onEquipItem={handleEquip}
                        onRemoveInventoryItem={handleRemoveItem}
                        getPatternPreview={getPatternPreview}
                        getBackgroundPreview={getBackgroundPreview}
                        onToggleBadge={handleToggleBadge}
                        onSaveBadges={handleSaveBadges}
                    />
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}

