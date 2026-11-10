import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { ArrowUpRight, ScrollText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PolicyLinkItem } from '@/content/policies'

interface PolicyMetaItem {
  label: string
  value: string
}

interface PolicyPageShellProps {
  eyebrow: string
  title: string
  summary: string
  meta?: PolicyMetaItem[]
  children: ReactNode
  aside?: ReactNode
  /** Icon in the hero title; ScrollText if not given. */
  icon?: ReactNode
}

export function PolicyPageShell({
  eyebrow,
  title,
  summary,
  meta = [],
  children,
  aside,
  icon,
}: PolicyPageShellProps) {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-[28px] border border-primary/15 bg-card/95 shadow-[0_24px_80px_-54px_hsl(var(--primary)/0.55)]">
          {/* Dekoratif zemin: kose isima + ince nokta dokusu */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.22),transparent_46%),radial-gradient(circle_at_bottom_right,hsl(var(--primary)/0.08),transparent_38%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(hsl(var(--primary)/0.14)_1px,transparent_1px)] [background-size:22px_22px]"
          />
          <div className="relative px-5 py-7 sm:px-8 sm:py-9">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/15 text-primary shadow-[0_10px_30px_-14px_hsl(var(--primary)/0.7)]">
                {icon ?? <ScrollText className="size-5" />}
              </span>
              <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-primary">
                {eyebrow}
              </span>
            </div>
            <h1 className="mt-5 max-w-4xl text-3xl font-black tracking-tight text-foreground sm:text-[2.6rem] sm:leading-[1.15]">
              {title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              {summary}
            </p>
            {meta.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {meta.map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 py-1.5 pl-3 pr-3.5 text-xs backdrop-blur-sm"
                  >
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span className="font-bold uppercase tracking-wide text-muted-foreground">{item.label}:</span>
                    <span className="font-medium text-foreground">{item.value}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <div className={cn('grid gap-6', aside && 'lg:grid-cols-[minmax(0,1fr)_300px]')}>
          <div className="min-w-0">{children}</div>
          {aside ? (
            <div className="lg:sticky lg:top-6 lg:self-start">
              {aside}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function PolicyAsideCard({
  title,
  children,
  className,
  icon,
}: {
  title: string
  children: ReactNode
  className?: string
  icon?: ReactNode
}) {
  return (
    <section className={cn('overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-sm', className)}>
      <div className="flex items-center gap-2 border-b border-border/60 bg-primary/[0.06] px-4 py-3">
        {icon ? <span className="text-primary [&>svg]:size-4">{icon}</span> : <span className="size-1.5 rounded-full bg-primary" />}
        <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-foreground/80">
          {title}
        </h2>
      </div>
      <div className="space-y-3 p-4">
        {children}
      </div>
    </section>
  )
}

export function PolicyLinkList({ links }: { links: PolicyLinkItem[] }) {
  return (
    <div className="space-y-2">
      {links.map((link) => (
        <Link
          key={`${link.to}-${link.label}`}
          to={link.to}
          className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/85 px-3.5 py-2.5 text-sm font-medium text-foreground transition-all hover:border-primary/35 hover:bg-primary/[0.06] hover:text-primary"
        >
          <span>{link.label}</span>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
      ))}
    </div>
  )
}
