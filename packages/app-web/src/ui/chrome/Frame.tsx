import { classNames, ThemeToggle } from "@labkit/ui";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import markUrl from "@labkit/design/mark.svg";
import "@labkit/design/tokens.css";
import { useSavedTheme } from "../saved-theme";
import "./chrome.css";

/**
 * The top bar every page shares: the LabKit mark and name, which open the list of workspaces, then
 * the page's own controls, then the theme button. `onHome` replaces the link when the page has
 * more to do on its way home than navigate.
 */
export function TopBar({
  onHome,
  children,
  end,
}: {
  onHome?: () => void;
  children?: ReactNode;
  /** Controls at the right, before the theme button. */
  end?: ReactNode;
}) {
  const [theme, setTheme] = useSavedTheme();
  const brand = (
    <>
      <img className="brand-mark" src={markUrl} alt="" />
      <span className="brand-name">LabKit</span>
    </>
  );
  return (
    <header className="topbar">
      {onHome === undefined ? (
        <Link to="/$" params={{ _splat: "" }} className="brand" title="Back to the workspaces">
          {brand}
        </Link>
      ) : (
        <button type="button" className="brand" title="Back to the workspaces" onClick={onHome}>
          {brand}
        </button>
      )}
      {children}
      <span className="topbar-gap" />
      {end}
      <ThemeToggle theme={theme} onChange={setTheme} className="theme-btn" />
    </header>
  );
}

/**
 * A page of the app: the palette, the top bar and the page below it. The theme is the one every
 * page shares (`useSavedTheme`), so content a page draws in it and the bar's button agree.
 */
export function Frame({
  bar,
  end,
  className,
  children,
}: {
  /** The page's controls in the top bar, after the name. */
  bar?: ReactNode;
  /** The page's controls at the right of the top bar. */
  end?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [theme] = useSavedTheme();
  return (
    <div
      className={classNames("lk-root lk-frame", className)}
      data-theme={theme === "system" ? undefined : theme}
    >
      <TopBar end={end}>{bar}</TopBar>
      {children}
    </div>
  );
}
