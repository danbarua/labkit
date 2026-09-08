/**
 * A view is a function from a report to the text a terminal shows.
 */

import type { Palette } from "./palette";

/**
 * How one report reads. Pure — it returns text and prints nothing.
 */
export type View<T> = (value: T, palette: Palette) => string;

/**
 * What a command answers with: the report, and how to read it.
 */
export interface Answer<T = unknown> {
  value: T;
  render(palette: Palette): string;
}

/** Pairs a report with its view. This is where the two are held to each other. */
export function answer<T>(value: T, view: View<T>): Answer<T> {
  return { value, render: (palette) => view(value, palette) };
}

/**
 * The `--json` view. Indented, because a person reads this too when debugging.
 */
export const asJson = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * The view for an act, as opposed to a question.
 */
export const asHandles: View<readonly string[]> = (handles) => handles.join("\n");
