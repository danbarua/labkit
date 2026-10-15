import { createContext } from "react";

/** What a host tells the transcript about the records the prose may name. */
export interface RecordsConfig {
  /** Maps a handle's prefix to what it names, for example `CLM` to `Claim`. */
  readonly types: Readonly<Record<string, string>>;
  /** Called when a handle is pressed. Without it handles are shown but cannot be pressed. */
  readonly onOpen?: (handle: string) => void;
}

export const RecordsContext = createContext<RecordsConfig | undefined>(undefined);
