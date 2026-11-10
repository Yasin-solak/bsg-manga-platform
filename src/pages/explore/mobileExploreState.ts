import type { ExploreSortId, ExploreStatusId } from './explorePageShared'

/** Status filter and sorting should not erase each other. */
export function nextMobileCatalogSelection(
  selected: ExploreSortId | 'completed', sort: ExploreSortId, status: ExploreStatusId,
): { sort: ExploreSortId; status: ExploreStatusId } {
  if (selected === 'completed') return { sort, status: status === 'completed' ? 'all' : 'completed' }
  return { sort: selected, status }
}
