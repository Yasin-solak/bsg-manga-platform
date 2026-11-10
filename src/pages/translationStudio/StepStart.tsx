import type { ReactNode } from 'react'
import { ArrowRight, Books, MagicWand, PencilSimpleLine, Translate, UploadSimple } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { isTaskOverdue, TL_TASK_STAGES, TL_TASK_STATUS_LABEL, type TlMyTask } from '@/services/translationTaskService'
import type { TlProject, TlProjectStage } from '@/services/translationStudioService'
import { PrimaryButton } from './studioUi'
import { intlLocale, txa } from '@/i18n/activeLocale'

const FLOW = [
  { icon: Books, get title() { return txa('Seri seç ya da ekle') }, get text() { return txa('Sitedeki bir seriyi bul veya yeni seri aç.') } },
  { icon: UploadSimple, get title() { return txa('Sayfaları yükle') }, get text() { return txa('Ham sayfaları sürükle; sıra dosya adından gelir.') } },
  { icon: MagicWand, get title() { return txa('Otomatik tara') }, get text() { return txa('Balon, anlatım, SFX ve tabelalar bulunur; metin okunur, çeviri önerilir.') } },
  { icon: PencilSimpleLine, get title() { return txa('Düzelt ve yayınla') }, get text() { return txa('Önerileri onayla, eksikleri elle ekle, yayınla.') } },
]

const STAGE_LABEL: Record<TlProjectStage, string> = {
  get upload() { return txa('Yüklemede') },
  get scan() { return txa('Taramada') },
  get edit() { return txa('Düzenlemede') },
  get publish() { return txa('Yayına hazır') },
  get scheduled() { return txa('Zamanlandı') },
  get published() { return txa('Yayında') },
  get archived() { return txa('Arşivde') },
}

export function StepStart({ fansubName, drafts, draftsLoading, onStart, onOpenDraft, canStart = true, myTasks = [], onOpenTask, seriesSlot }: {
  fansubName: string
  drafts: TlProject[]
  draftsLoading: boolean
  onStart: () => void
  onOpenDraft: (project: TlProject) => void
  /** Project management permission: otherwise new chapters cannot open, drafts can. */
  canStart?: boolean
  /** Open tasks assigned to you in this fansub. */
  myTasks?: TlMyTask[]
  onOpenTask?: (task: TlMyTask) => void
  /** "My series" section (the team's series on the site and in the studio). */
  seriesSlot?: ReactNode
}) {
  return (
    <div className='tl-screen flex min-h-0 flex-1 justify-center overflow-y-auto p-6 sm:p-10'>
      {/* my-auto: icerik uzayinca (Serilerimiz) ust kisim kaydirma disinda kalmaz. */}
      <div className='my-auto flex w-full max-w-[920px] flex-col gap-8'>
        <div className='flex flex-col gap-3.5'>
          <span className='inline-flex h-7 items-center gap-2 self-start rounded-full border border-[var(--tl-p35)] bg-[var(--tl-p15)] px-3 text-xs font-extrabold text-[var(--tl-p)]'>
            <Translate weight='fill' size={13} />
            {txa('{v1} · Çeviri Stüdyosu', { v1: fansubName })}
          </span>
          <h1 className='tl-serif m-0 text-[40px] leading-[1.04] tracking-[-0.02em] sm:text-[52px]'>{txa('Yeni bir bölüm çevir')}</h1>
          <p className='m-0 max-w-[640px] text-base font-medium leading-relaxed text-[var(--tl-mut)] [text-wrap:pretty]'>
            {txa("Ham sayfaları yükle. Balonları, metinleri ve SFX'leri sistem bulsun, çeviriyi önersin. Sen düzelt, onayla, yayınla.")}
          </p>
        </div>

        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          {FLOW.map((step, index) => (
            <div key={step.title} className='flex flex-col gap-3 rounded-xl border border-[var(--tl-line)] bg-[var(--tl-card)] p-[18px]'>
              <span className='flex items-center justify-between'>
                <span className='flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--tl-acc)] text-[var(--tl-p)]'>
                  <step.icon weight='bold' size={18} />
                </span>
                <span className='tl-serif text-[26px] text-[var(--tl-dim)]'>{index + 1}</span>
              </span>
              <span className='text-sm font-bold'>{step.title}</span>
              <span className='text-[12.5px] font-medium leading-normal text-[var(--tl-mut)] [text-wrap:pretty]'>{step.text}</span>
            </div>
          ))}
        </div>

        <div className='flex items-center gap-3'>
          <PrimaryButton size='lg' onClick={onStart} disabled={!canStart} title={canStart ? undefined : txa('Yeni bölüm açmak için proje yönetimi izni gerekir')} data-testid='tl-start'>
            {txa('Başla')}
            <ArrowRight weight='bold' size={15} />
          </PrimaryButton>
        </div>

        {myTasks.length > 0 && (
          <div className='flex flex-col gap-2.5 border-t border-[var(--tl-line)] pt-[22px]' data-testid='tl-my-tasks'>
            <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Sana atanan işler')}</span>
            <div className='flex flex-wrap gap-2'>
              {myTasks.map((task) => (
                <button
                  key={task.taskId}
                  type='button'
                  onClick={() => onOpenTask?.(task)}
                  className='flex items-center gap-2.5 rounded-xl border border-[var(--tl-line)] bg-transparent px-3 py-2 text-left text-[var(--tl-fg)] transition-colors hover:border-[var(--tl-p35)]'
                >
                  <span className='rounded-md bg-[var(--tl-p15)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--tl-p)]'>{TL_TASK_STAGES.find((stage) => stage.key === task.stage)?.label}</span>
                  <span className='text-[13px] font-bold'>{task.seriesTitle ?? txa('Bölüm')}{task.chapterNumber !== null ? ` · ${task.chapterNumber}` : ''}{' '}{txa('· Sayfa')}{' '}{task.pageNumber}</span>
                  <span className={cn('text-xs font-semibold', isTaskOverdue(task) ? 'text-[var(--tl-red)]' : 'text-[var(--tl-mut)]')}>
                    {isTaskOverdue(task) ? txa('Gecikti') : TL_TASK_STATUS_LABEL[task.status]}
                    {task.dueAt ? ` · ${new Date(task.dueAt).toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short' })}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {(draftsLoading || drafts.length > 0) && (
          <div className='flex flex-col gap-2.5 border-t border-[var(--tl-line)] pt-[22px]'>
            <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Yarım kalan')}</span>
            {draftsLoading && <span className='text-[12.5px] font-semibold text-[var(--tl-dim)]'>{txa('Yükleniyor…')}</span>}
            <div className='flex flex-wrap gap-2.5'>
              {drafts.map((project) => (
                <button
                  key={project.id}
                  type='button'
                  onClick={() => onOpenDraft(project)}
                  className='flex w-full max-w-[460px] items-center gap-3.5 rounded-xl border border-[var(--tl-line)] bg-transparent p-2.5 text-left text-[var(--tl-fg)] transition-colors hover:border-[var(--tl-p35)]'
                >
                  {project.coverUrl
                    ? <img src={project.coverUrl} alt='' className='h-[60px] w-10 rounded-md object-cover' />
                    : <span className='tl-hatch h-[60px] w-10 rounded-md' />}
                  <span className='flex flex-1 flex-col gap-1'>
                    <span className='text-sm font-bold'>
                      {txa('{v1} · Bölüm {v2}', { v1: project.seriesTitle, v2: project.chapterNumber })}
                      {project.revisionOf && <span className='ml-2 rounded-md bg-[var(--tl-p15)] px-1.5 py-0.5 text-[10.5px] font-extrabold text-[var(--tl-p)]'>{txa('Revizyon')}</span>}
                    </span>
                    <span className='text-xs font-semibold text-[var(--tl-mut)]'>
                      {project.revisionOf && project.stage === 'publish' ? txa('Onaya gönderildi') : STAGE_LABEL[project.stage]} · {txa('{v1} sayfa', { v1: project.pageCount })}
                    </span>
                  </span>
                  <ArrowRight weight='bold' size={15} className='text-[var(--tl-mut)]' />
                </button>
              ))}
            </div>
          </div>
        )}

        {seriesSlot}
      </div>
    </div>
  )
}
