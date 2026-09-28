import { CheckCircleIcon, InfoIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastTone = "info" | "success" | "error";

export interface ToastOptions {
  tone?: ToastTone;
  /** How long it stays, in milliseconds. An error stays until dismissed unless this is given. */
  duration?: number;
  action?: { label: string; onPress: () => void };
}

interface Toast extends Required<Pick<ToastOptions, "tone">> {
  readonly id: number;
  readonly message: string;
  readonly duration: number | undefined;
  readonly action: ToastOptions["action"];
}

export interface Toasts {
  show: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<Toasts | undefined>(undefined);

/** Shows and dismisses toasts. Outside a `ToastProvider` it does nothing. */
export function useToasts(): Toasts {
  return useContext(ToastContext) ?? { show: () => -1, dismiss: () => {} };
}

const ICON = { info: InfoIcon, success: CheckCircleIcon, error: WarningCircleIcon } as const;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);
  const started = useRef(Date.now());
  // The latest dismiss, read when the timer fires: a new closure each render must not restart it.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  // Hovering or focusing a toast holds it, so nobody loses a message while reading or reaching it.
  useEffect(() => {
    if (remaining.current === undefined) return;
    if (paused) {
      remaining.current -= Date.now() - started.current;
      return;
    }
    started.current = Date.now();
    const timer = setTimeout(() => dismiss.current(), Math.max(0, remaining.current));
    return () => clearTimeout(timer);
  }, [paused]);

  const Icon = ICON[toast.tone];
  return (
    <li
      className="lk-toast"
      data-tone={toast.tone}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className="lk-toast-icon" aria-hidden="true" />
      <span className="lk-toast-message">{toast.message}</span>
      {toast.action === undefined ? null : (
        <button
          type="button"
          className="lk-btn lk-btn-small"
          onClick={() => {
            toast.action?.onPress();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="lk-icon-btn" aria-label="Dismiss" onClick={onDismiss}>
        <XIcon aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Holds the toasts for everything inside it and draws them in one corner. Both live regions are
 * always present, empty or not, so a screen reader is already listening when the first toast
 * arrives: errors in an assertive one that interrupts, everything else in a polite one.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);
  const show = useCallback((message: string, options: ToastOptions = {}) => {
    const id = next.current++;
    const tone = options.tone ?? "info";
    const duration = options.duration ?? (tone === "error" ? undefined : 5000);
    setToasts((all) => [...all, { id, message, tone, duration, action: options.action }]);
    return id;
  }, []);
  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  const list = (errors: boolean) => (
    <ol aria-live={errors ? "assertive" : "polite"}>
      {toasts
        .filter((toast) => (toast.tone === "error") === errors)
        .map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
    </ol>
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section className="lk-toasts" aria-label="Notifications">
        {list(true)}
        {list(false)}
      </section>
    </ToastContext.Provider>
  );
}
