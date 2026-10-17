"use client";

import { BellIcon, CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon } from "lucide-react";
import { useEffect, useLayoutEffect, type ReactNode } from "react";
import {
  AnimatedToastStack,
  useAnimatedToastStack,
  type ToastClassNames,
  type ToastInput,
  type ToastStatus,
} from "./toast-stack";

/*
 * Toasts: `toast("Saved")`, `toast.success/error/info/loading(title, opts)`, `toast.promise(p, msgs)`,
 * `toast.dismiss(id?)`. Callable from anywhere on the client; <Toaster /> (mounted once in the root
 * layout) owns the stack. Reuse an `id` to morph a toast in place (loading -> success).
 */

export interface ToastOptions {
  id?: string;
  description?: ReactNode;
  action?: { label: ReactNode; onClick: () => void };
  /** ms; 0 keeps it until dismissed. Default 4000 (loading: until resolved). */
  duration?: number;
}

type Show = (title: ReactNode, options?: ToastOptions) => string;
type Stack = Pick<ReturnType<typeof useAnimatedToastStack>, "showToast" | "updateToast" | "dismissToast" | "clearToasts">;

let stack: Stack | null = null;
/** Calls made before <Toaster /> mounted, replayed in order once it registers. */
const queue: ((s: Stack) => void)[] = [];
/** Ids on screen (or about to be): decides show vs update-in-place. */
const live = new Set<string>();
let seed = 0;

const run = (task: (s: Stack) => void) => (stack ? task(stack) : queue.push(task));

function show(status: ToastStatus): Show {
  return (title, options = {}) => {
    const id = options.id ?? `toast-${++seed}`;
    run((s) => {
      const input: ToastInput = {
        title,
        description: options.description,
        status,
        action: options.action && {
          label: options.action.label,
          onClick: () => {
            options.action?.onClick();
            toast.dismiss(id);
          },
        },
        duration: options.duration ?? (status === "loading" ? 0 : DURATION),
        dismissible: status !== "loading",
      };
      if (live.has(id)) s.updateToast(id, input);
      else s.showToast({ id, ...input });
      live.add(id);
    });
    return id;
  };
}

export const toast = Object.assign(show("neutral"), {
  success: show("success"),
  error: show("error"),
  info: show("info"),
  loading: show("loading"),
  dismiss: (id?: string) =>
    run((s) => {
      if (id === undefined) {
        live.clear();
        s.clearToasts();
      } else {
        live.delete(id);
        s.dismissToast(id);
      }
    }),
  promise: async <T,>(
    promise: Promise<T> | (() => Promise<T>),
    msg: { loading: ReactNode; success: ReactNode | ((v: T) => ReactNode); error: ReactNode | ((e: unknown) => ReactNode) },
  ): Promise<T> => {
    const id = toast.loading(msg.loading);
    try {
      const value = await (typeof promise === "function" ? promise() : promise);
      toast.success(typeof msg.success === "function" ? msg.success(value) : msg.success, { id });
      return value;
    } catch (e) {
      toast.error(typeof msg.error === "function" ? msg.error(e) : msg.error, { id });
      throw e;
    }
  },
});

const DURATION = 4000;

// Popover surface, neutral icons (status is icon + text, never hue); only info reads blue.
const CLASS_NAMES: ToastClassNames = {
  surface: "rounded-lg border-border bg-popover text-popover-foreground shadow-lg backdrop-blur-none",
  iconWrap: "mt-0 size-5 rounded-none bg-transparent text-foreground dark:text-foreground",
  title: "whitespace-normal wrap-break-word",
  description: "line-clamp-none wrap-break-word",
  action: "rounded-md bg-secondary text-[13px] text-secondary-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
  close: "rounded-md outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
};

const ICONS: Partial<Record<ToastStatus, ReactNode>> = {
  neutral: <BellIcon className="size-4" />,
  info: <InfoIcon className="size-4 text-info" />,
  loading: <Loader2Icon className="size-4" />,
  success: <CircleCheckIcon className="size-4" />,
  error: <OctagonXIcon className="size-4" />,
};

export function Toaster() {
  const { toasts, showToast, updateToast, dismissToast, clearToasts } = useAnimatedToastStack({ defaultDuration: DURATION, limit: 6 });

  // Timeouts and swipes remove toasts without us; forget their ids so a reused id shows afresh.
  useLayoutEffect(() => {
    const shown = new Set(toasts.map((t) => t.id));
    for (const id of live) if (!shown.has(id)) live.delete(id);
  }, [toasts]);

  useEffect(() => {
    const next = { showToast, updateToast, dismissToast, clearToasts };
    stack = next;
    for (const task of queue.splice(0)) task(next);
    return () => {
      if (stack === next) stack = null;
    };
  }, [showToast, updateToast, dismissToast, clearToasts]);

  return (
    <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="top-right" placement="fixed" maxVisible={3} classNames={CLASS_NAMES} icons={ICONS} />
  );
}
