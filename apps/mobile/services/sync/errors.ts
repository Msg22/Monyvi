export function getSyncErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return String(error);
}

export function createSyncTableError(
  operation: "pull" | "insert" | "upsert" | "delete",
  table: string,
  error: unknown
): Error {
  return new Error(
    `Supabase ${operation} failed for ${table}: ${getSyncErrorMessage(error)}`
  );
}

export function createForeignLocalChangeError(table: string): Error {
  return new Error(
    `Refusing to sync foreign local changes for ${table}; local row does not belong to the authenticated user`
  );
}
