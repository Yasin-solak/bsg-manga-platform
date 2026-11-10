/**
 * ChapterAddPage: chapter add route (full page shell).
 *
 * The form body and state are in the reusable ChapterCreateForm /
 * useChapterCreateForm. This page only provides the full page shell;
 * the same form also works in the in-studio modal.
 */
import { useParams } from 'react-router-dom'
import { Link, useNavigate } from '@/i18n/router'
import { ArrowLeft, FilePlus } from 'lucide-react'
import ChapterCreateForm from '@/components/fansub/chapterCreate/ChapterCreateForm'
import { useChapterCreateForm } from '@/components/fansub/chapterCreate/useChapterCreateForm'
import { txa } from '@/i18n/activeLocale'

function ChapterAddPage() {
  const { id: fansubId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const backHref = fansubId ? `/fansub/${fansubId}/yonet#bolumler` : '/fansublar'

  const form = useChapterCreateForm({
    fansubId,
    onSuccess: () => navigate(backHref),
  })

  return (
    <div className="min-h-screen bg-background py-6">
      <div className="container mx-auto space-y-6 px-4 sm:px-6 lg:max-w-7xl lg:px-8">
        <section className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-1 w-full bg-gradient-to-r from-primary via-primary/60 to-transparent" />
          <div className="p-5">
            <Link
              to={backHref}
              className="group mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              {txa('Fansub yonetime don')}
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FilePlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{txa('Bolum Ekle')}</h1>
                <p className="text-sm text-muted-foreground">{txa('Zorunlu alanlar * ile isaretlidir.')}</p>
              </div>
            </div>
          </div>
        </section>

        <ChapterCreateForm form={form} variant="page" cancelHref={backHref} />
      </div>
    </div>
  )
}

export default ChapterAddPage
