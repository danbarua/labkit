/** The theme button, and where a conversation draws it. */

import { describe, expect, test } from "bun:test";
import { initialState } from "@labkit/view-model";
import { renderToStaticMarkup } from "react-dom/server";
import { Conversation } from "../conversation";
import { ThemeToggle } from "../theme";

describe("the theme button", () => {
  test("names the current setting and the next one", () => {
    const html = (theme: "system" | "light" | "dark") =>
      renderToStaticMarkup(<ThemeToggle theme={theme} onChange={() => {}} />);
    expect(html("system")).toContain('aria-label="Theme: system. Switch to light"');
    expect(html("light")).toContain('aria-label="Theme: light. Switch to dark"');
    expect(html("dark")).toContain('aria-label="Theme: dark. Switch to system"');
  });

  test("is in a conversation's header only when the host takes the change", () => {
    const without = renderToStaticMarkup(<Conversation state={initialState} theme="dark" />);
    const withIt = renderToStaticMarkup(
      <Conversation state={initialState} theme="dark" onThemeChange={() => {}} />,
    );
    expect(without).not.toContain("Theme: ");
    expect(withIt).toContain('aria-label="Theme: dark. Switch to system"');
    expect(withIt).toContain('data-theme="dark"');
  });

  test("on system, the conversation follows the system's setting", () => {
    const html = renderToStaticMarkup(<Conversation state={initialState} theme="system" />);
    expect(html).not.toContain("data-theme");
  });
});
