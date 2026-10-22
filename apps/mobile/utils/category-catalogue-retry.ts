/**
 * Requests the ordinary protected sync so the category catalogue can be
 * accepted again.
 *
 * The sync service is imported lazily: a component that only offers the retry
 * action must not pull the sync (and its database adapter) into its own module
 * graph. No raw network call is made from the UI; the normal protected sync
 * path does the work.
 */

export async function requestCatalogueSync(): Promise<void> {
  const [{ database }, { syncDatabase }] = await Promise.all([
    import("@monyvi/db"),
    import("@/services/sync"),
  ]);
  await syncDatabase(database);
}
