/** The message of a thrown value: an Error's message, or else the value as a string. */
export const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
