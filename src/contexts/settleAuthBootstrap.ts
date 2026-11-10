// If the session changes during the startup request, the old result finishing is not enough.
export async function settleAuthBootstrap(
  sync: () => Promise<void>,
  revision: () => number,
  active: () => boolean,
) {
  while (active()) {
    const pending = sync()
    const startedRevision = revision()
    await pending
    if (revision() === startedRevision) return
  }
}
