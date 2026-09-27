import type { SessionConfigOption } from "@agentclientprotocol/sdk";

type Select = Extract<SessionConfigOption, { type: "select" }>;

/** The choices of a select option, flat or in groups, as `[group, choices]` pairs. */
function groupsOf(option: Select): readonly [string | undefined, Select["options"]][] {
  const first = option.options[0];
  if (first !== undefined && "group" in first) {
    return (option.options as Extract<Select["options"][number], { group: string }>[]).map(
      (group) => [group.name, group.options as unknown as Select["options"]] as const,
    );
  }
  return [[undefined, option.options]];
}

function SelectControl({
  option,
  onSelect,
}: {
  option: Select;
  onSelect: ((value: string) => void) | undefined;
}) {
  return (
    <label className="lk-config">
      <span>{option.name}</span>
      <select
        value={option.currentValue}
        disabled={onSelect === undefined}
        onChange={(event) => onSelect?.(event.target.value)}
      >
        {groupsOf(option).map(([group, choices]) => {
          const items = (choices as readonly { value: string; name: string }[]).map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.name}
            </option>
          ));
          return group === undefined ? (
            items
          ) : (
            <optgroup key={group} label={group}>
              {items}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}

/**
 * The session's configuration, such as the model and how much it thinks. What shows is what the
 * agent last said is selected. Without `onSelect` the controls are shown and cannot be changed.
 */
export function ConfigBar({
  options,
  onSelect,
}: {
  options: readonly SessionConfigOption[];
  onSelect?: ((configId: string, value: string | boolean) => void) | undefined;
}) {
  return (
    <fieldset className="lk-config-bar" aria-label="Session configuration">
      {options.map((option) => {
        if (option.type === "select") {
          return (
            <SelectControl
              key={option.id}
              option={option}
              onSelect={onSelect && ((value) => onSelect(option.id, value))}
            />
          );
        }
        if (option.type === "boolean") {
          return (
            <label key={option.id} className="lk-config">
              <input
                type="checkbox"
                checked={option.currentValue}
                disabled={onSelect === undefined}
                onChange={(event) => onSelect?.(option.id, event.target.checked)}
              />
              <span>{option.name}</span>
            </label>
          );
        }
        return null;
      })}
    </fieldset>
  );
}
