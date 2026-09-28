import { IconContext } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ToastProvider } from "./overlay/toast";

/** Every icon in these components: one size and weight, in the colour of the text around it. */
export const ICONS = { size: 14, weight: "regular", color: "currentColor" } as const;

/**
 * The ground these components stand on outside a conversation: the theme, the icon defaults and
 * toasts. Overlays opened inside it stay inside it, so they keep the theme.
 */
export function Surface({
  theme,
  className,
  children,
}: {
  /** Leave unset to follow the system's light or dark setting. */
  theme?: "light" | "dark" | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <IconContext.Provider value={ICONS}>
      <div
        className={["lk-root", className].filter(Boolean).join(" ")}
        {...(theme ? { "data-theme": theme } : {})}
      >
        <ToastProvider>{children}</ToastProvider>
      </div>
    </IconContext.Provider>
  );
}
