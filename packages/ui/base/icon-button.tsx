import type { Icon } from "@phosphor-icons/react";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "title" | "aria-label" | "children"
>;

/**
 * A button drawn as an icon alone. `label` is its accessible name and its hover text. The icon is
 * hidden from assistive technology, since the label already names the button.
 */
export function IconButton({
  label,
  icon: Glyph,
  title = label,
  size,
  on = false,
  unavailable,
  disabled,
  className = "lk-icon-btn",
  ...button
}: ButtonProps & {
  label: string;
  icon: Icon;
  /** The hover text, when it should say something other than `label`. */
  title?: string;
  /** The icon's size in pixels, when it differs from the icons around it. */
  size?: number;
  /** Adds the `on` class, for a button whose state is shown by its colour. */
  on?: boolean;
  /** Why the button cannot be pressed now. It disables the button and is its hover text. */
  unavailable?: string | undefined;
}) {
  return (
    <button
      type="button"
      className={on ? `${className} on` : className}
      aria-label={label}
      title={unavailable ?? title}
      disabled={disabled === true || unavailable !== undefined}
      {...button}
    >
      <Glyph aria-hidden="true" {...(size === undefined ? {} : { size })} />
    </button>
  );
}
