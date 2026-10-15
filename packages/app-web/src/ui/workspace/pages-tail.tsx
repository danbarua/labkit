import type { ReactNode } from "react";
import type { Pages } from "./hal-store";

/**
 * What a paged list shows under its rows. If the last page failed, the note says why. While a page
 * loads, `loading` shows. Otherwise `empty` shows when the caller gives it. Below that, a button
 * loads the next page while the last page names one, unless `more` is `false`.
 */
export function PagesTail({
  pages,
  note = "empty-note",
  loading = null,
  empty,
  more = "Load more",
  moreClass = "load-more",
}: {
  pages: Pages<unknown>;
  /** The class of the failure and empty notes. */
  note?: string;
  loading?: ReactNode;
  /** The note to show once loaded, such as "Nothing here." when the list has no rows. */
  empty?: string | undefined;
  /** The next-page button's text, or `false` for a list that shows only its first page. */
  more?: string | false;
  moreClass?: string;
}) {
  return (
    <>
      {pages.error !== undefined ? (
        <div className={note}>Fetch failed: {pages.error}</div>
      ) : pages.loading ? (
        loading
      ) : empty === undefined ? null : (
        <div className={note}>{empty}</div>
      )}
      {more !== false && pages.next !== undefined && !pages.loading ? (
        <button type="button" className={`tbtn primary ${moreClass}`} onClick={pages.more}>
          {more}
        </button>
      ) : null}
    </>
  );
}
