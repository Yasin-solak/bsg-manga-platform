import type { Manga } from '@/types'

interface HeroSources {
  config: () => Promise<{ featuredMangaIds: string[] }>
  featured: (ids: string[]) => Promise<Manga[]>
  trending: (limit: number) => Promise<Manga[]>
}

// The showcase should not wait for community, cosmetic and chapter enrichments.
export async function loadHomeHero(sources: HeroSources): Promise<Manga[]> {
  try {
    const { featuredMangaIds } = await sources.config()
    if (featuredMangaIds.length) {
      const featured = await sources.featured(featuredMangaIds)
      if (featured.length) return featured.slice(0, 5)
    }
  } catch {
    // Ayar okunamazsa yalnız herkese açık trend kaynağına geçilir.
  }
  return (await sources.trending(5)).slice(0, 5)
}
