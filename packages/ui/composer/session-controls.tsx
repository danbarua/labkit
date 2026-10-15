import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import {
  BrainIcon,
  CaretDownIcon,
  CpuIcon,
  GearSixIcon,
  type Icon,
  ShieldIcon,
} from "@phosphor-icons/react";
import type { PickItem } from "../overlay/list";
import type { MenuEntry } from "./composer-menu";

type Select = Extract<SessionConfigOption, { type: "select" }>;
type Choice = {
  readonly value: string;
  readonly name: string;
  readonly description?: string | null;
};

/** The categories that get a control of their own, in the order they sit; the rest share one. */
const FEATURED: readonly [string, Icon][] = [
  ["mode", ShieldIcon],
  ["model", CpuIcon],
  ["thought_level", BrainIcon],
];

/** An option's choices as `[group, choices]` pairs, whether the agent grouped them or not. */
function groupsOf(option: Select): readonly [string | undefined, readonly Choice[]][] {
  const first = option.options[0];
  if (first !== undefined && "group" in first) {
    return (option.options as unknown as { name: string; options: Choice[] }[]).map(
      (group) => [group.name, group.options] as const,
    );
  }
  return [[undefined, option.options as unknown as Choice[]]];
}

/** The name the agent gives an option's current value, for the control that shows it. */
export function currentLabel(option: SessionConfigOption): string {
  if (option.type === "boolean") return option.currentValue ? "On" : "Off";
  if (option.type !== "select") return "";
  for (const [, choices] of groupsOf(option)) {
    const found = choices.find((c) => c.value === option.currentValue);
    if (found !== undefined) return found.name;
  }
  return String(option.currentValue);
}

const SEP = "\u0000";
/** The option and value a picked item stands for. */
export function pickedSetting(item: PickItem): [configId: string, value: string | boolean] {
  const [configId = "", kind = "", value = ""] = item.id.split(SEP);
  return [configId, kind === "b" ? value === "true" : value];
}

/**
 * Every value `option` can take, as items for a palette. `grouped` heads them with the option's
 * name, for a palette that lists several options at once.
 */
export function settingItems(option: SessionConfigOption, grouped: boolean): PickItem[] {
  if (option.type === "boolean") {
    return [true, false].map((on) => ({
      id: [option.id, "b", String(on)].join(SEP),
      label: on ? "On" : "Off",
      current: option.currentValue === on,
      ...(grouped ? { group: option.name } : {}),
    }));
  }
  if (option.type !== "select") return [];
  return groupsOf(option).flatMap(([group, choices]) =>
    choices.map((choice) => ({
      id: [option.id, "s", choice.value].join(SEP),
      label: choice.name,
      current: choice.value === option.currentValue,
      ...(choice.description ? { detail: choice.description } : {}),
      ...(grouped
        ? { group: group === undefined ? option.name : `${option.name} · ${group}` }
        : group === undefined
          ? {}
          : { group }),
      keywords: choice.value,
    })),
  );
}

/** The options that get a control each, with its icon, and the ones that go behind settings. */
export function arrange(options: readonly SessionConfigOption[]) {
  const featured: [SessionConfigOption, Icon][] = [];
  for (const [category, icon] of FEATURED) {
    for (const option of options) if (option.category === category) featured.push([option, icon]);
  }
  const rest = options.filter((option) => !featured.some(([f]) => f === option));
  return { featured, rest };
}

/**
 * The settings group of the composer's menu.
 * - While the composer is `narrow`, its bar has no room for the featured options' chips, so each
 *   featured option is a row showing its value. A boolean one flips when chosen; any other opens
 *   its picker. Without `onOpen` the settings cannot be changed, and these rows are disabled.
 * - The options without a chip of their own sit behind one "Session settings" row, which opens a
 *   picker for them all. It is there only when they can be changed.
 */
export function settingEntries(
  options: readonly SessionConfigOption[],
  narrow: boolean,
  handlers: {
    onOpen?: ((target: { optionId: string } | "settings") => void) | undefined;
    onToggle?: ((configId: string, value: boolean) => void) | undefined;
  },
): MenuEntry[] {
  const { onOpen, onToggle } = handlers;
  const { featured, rest } = arrange(options);
  const rows: MenuEntry[] = narrow
    ? featured.map(([option, IconOf]) => ({
        id: `option:${option.id}`,
        label: option.name,
        icon: <IconOf />,
        value: currentLabel(option),
        disabled: onOpen === undefined,
        ...(option.type === "boolean"
          ? {
              checked: option.currentValue,
              onChoose: () => onToggle?.(option.id, !option.currentValue),
            }
          : { opensPicker: true, onChoose: () => onOpen?.({ optionId: option.id }) }),
      }))
    : [];
  if (rest.length > 0 && onOpen !== undefined) {
    rows.push({
      id: "settings",
      label: "Session settings",
      icon: <GearSixIcon />,
      opensPicker: true,
      onChoose: () => onOpen("settings"),
    });
  }
  return rows;
}

/**
 * The session's featured options as small controls, each showing its current value. Each opens
 * a picker through `onOpen`; a boolean one flips in place. Without `onOpen` the values are shown
 * and cannot be changed. The other options are reached through the composer's menu.
 */
export function SessionControls({
  options,
  onOpen,
  onToggle,
}: {
  options: readonly SessionConfigOption[];
  onOpen?: ((target: { optionId: string }) => void) | undefined;
  onToggle?: ((configId: string, value: boolean) => void) | undefined;
}) {
  const { featured } = arrange(options);
  const readOnly = onOpen === undefined;
  return (
    <>
      {featured.map(([option, IconOf]) => {
        const value = currentLabel(option);
        const chip = (
          <>
            <IconOf className="lk-chip-icon" aria-hidden="true" />
            <span className="lk-chip-value">{value}</span>
          </>
        );
        if (readOnly) {
          return (
            <span key={option.id} className="lk-chip" title={`${option.name}: ${value}`}>
              {chip}
              <span className="lk-sr-only">{option.name}</span>
            </span>
          );
        }
        if (option.type === "boolean") {
          return (
            <button
              key={option.id}
              type="button"
              className="lk-chip"
              aria-pressed={option.currentValue}
              title={option.name}
              onClick={() => onToggle?.(option.id, !option.currentValue)}
            >
              {chip}
              <span className="lk-sr-only">{option.name}</span>
            </button>
          );
        }
        return (
          <button
            key={option.id}
            type="button"
            className="lk-chip"
            aria-haspopup="dialog"
            aria-label={`${option.name}: ${value}`}
            title={`${option.name}: ${value}`}
            onClick={() => onOpen({ optionId: option.id })}
          >
            {chip}
            <CaretDownIcon className="lk-chip-caret" aria-hidden="true" />
          </button>
        );
      })}
    </>
  );
}
