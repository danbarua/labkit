import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";

/** The colours these components are drawn in: the system's light or dark setting, or one chosen. */
export type Theme = "system" | "light" | "dark";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const NAME: Record<Theme, string> = { system: "system", light: "light", dark: "dark" };
const ICON = { system: DesktopIcon, light: SunIcon, dark: MoonIcon } as const;

/**
 * One button for the theme. Its icon is the current setting; pressing it moves to the next, in
 * the order system, light, dark.
 */
export function ThemeToggle({
  theme,
  onChange,
  className = "lk-icon-btn",
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
  className?: string;
}) {
  const Icon = ICON[theme];
  const label = `Theme: ${NAME[theme]}. Switch to ${NAME[NEXT[theme]]}`;
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      onClick={() => onChange(NEXT[theme])}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
