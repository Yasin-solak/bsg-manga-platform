import { Compass, Home } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Link } from '@/i18n/router'
import { Button } from '@/components/ui/button'
import { EXPLORE_PATH } from '@/lib/routes'
import { txa } from '@/i18n/activeLocale'

function getResourceLabel(resource: string | null) {
    if (!resource) return txa('Sayfa')
    if (resource === 'profile') return txa('Kullanıcı Profili')
    if (resource === 'fansub') return 'Fansub'
    if (resource === 'manga') return 'Manga'
    if (resource === 'chapter') return txa('Manga Bölümü')
    return txa('Sayfa')
}

function NotFoundPage() {
    const location = useLocation()
    const params = new URLSearchParams(location.search)
    const resource = params.get('resource')
    const value = params.get('value')
    const label = getResourceLabel(resource)

    return (
        <div className="flex min-h-[70vh] items-center justify-center px-4 py-6">
            <div className="w-full max-w-[720px] rounded-xl border border-border bg-card p-6 shadow-md sm:p-10">
                <p className="text-6xl font-extrabold leading-none text-primary sm:text-8xl">404</p>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {txa('{label} Bulunamadı', { label })}
                </h1>
                <p className="mt-2 text-muted-foreground">
                    {txa('Aradığınız içerik silinmiş, pasif olabilir veya bağlantı hatalı olabilir.')}
                </p>
                {value ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                        {txa('Hedef:')} <code className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs">{value}</code>
                    </p>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-3">
                    <Button asChild>
                        <Link to="/"><Home className="mr-2 h-4 w-4" /> {txa('Ana Sayfa')}</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link to={EXPLORE_PATH}><Compass className="mr-2 h-4 w-4" /> {txa('Keşfet')}</Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default NotFoundPage

