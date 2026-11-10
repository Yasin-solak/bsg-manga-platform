function MangaCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[1.45rem] border border-border/80 bg-card shadow-[0_18px_38px_-34px_rgba(15,23,42,0.18)] dark:bg-card/70 dark:shadow-none">
      <div className="aspect-[3/4] animate-pulse bg-muted" />
      <div className="space-y-3 px-3.5 py-3.5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  )
}

export default MangaCardSkeleton
