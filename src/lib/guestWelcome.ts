/**
 * "Has the welcome been shown in this browser?"
 *
 * PRODUCT RULE: a signed-out visitor opens the site on the WELCOME screen, not the home
 * page. But "Browse for now" sends them home; without this flag the home
 * page would send the visitor back to the welcome, creating an INFINITE LOOP.
 *
 * The flag only affects the OPENING: deep links (a shared series
 * address) are never converted to the welcome, or every shared link
 * would hit a login wall.
 *
 * If storage is unavailable (private tab) returns `false`: the welcome shows.
 * Failing that way is harmless, since "Browse for now" still offers an exit.
 */

const STORAGE_KEY = 'bsgmanga:guest-welcome-seen'

export function markGuestWelcomeSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /*
      Depolama yoksa isaret tutulamaz. Bu durumda ziyaretci ana sayfaya her
      dondugunde karsilamayi gorurdu; DONGUYU kirmak icin Layout ayrica
      yonlendirmeyi yalnizca kok rotada yapar ve "Şimdilik gez" dogrudan
      kesfete gonderir.
    */
  }
}

export function hasSeenGuestWelcome(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
