/**
 * MangaAddPage: manga add route (full page shell).
 *
 * The form body and state are now in the reusable MangaCreateForm /
 * useMangaCreateForm. This page only provides the full page shell (header +
 * back); the same form also works in the in-studio modal.
 */
import { useParams } from 'react-router-dom'
import { Link, useNavigate } from '@/i18n/router'
import { ArrowLeft, BookPlus } from 'lucide-react'
import MangaCreateForm from '@/components/fansub/mangaCreate/MangaCreateForm'
import { useMangaCreateForm } from '@/components/fansub/mangaCreate/useMangaCreateForm'
import { txa } from '@/i18n/activeLocale'

function MangaAddPage() {
  const { id: fansubId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const backHref = fansubId ? `/fansub/${fansubId}/yonet#mangalar` : '/fansublar'

  const form = useMangaCreateForm({
    fansubId,
    onSuccess: () => navigate(backHref),
  })

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-6 lg:max-w-7xl">
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
                <BookPlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{txa('Manga Ekle')}</h1>
                <p className="text-sm text-muted-foreground">{txa('Zorunlu alanlar * ile isaretlidir.')}</p>
              </div>
            </div>
          </div>
        </section>

        <MangaCreateForm form={form} variant="page" cancelHref={backHref} />
      </div>
    </div>
  )
}

export default MangaAddPage
