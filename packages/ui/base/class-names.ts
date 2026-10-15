/**
 * The class names given, joined by single spaces. A part that is `false`, `null`, `undefined` or
 * empty is left out, so a condition can stand in the list: `classNames("row", open && "open")`.
 */
export const classNames = (...parts: readonly (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ");
