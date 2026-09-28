import {
  AnimatedToastStack,
  useAnimatedToastStack,
  type ToastInput,
} from "@/components/motion/animated-toast-stack";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAction, useMediaQuery } from "./common";

interface Toaster {
  /** Shows a toast and returns its id, so it can be updated or dismissed. */
  show: (toast: ToastInput) => string;
  update: (id: string, patch: Partial<ToastInput>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<Toaster | null>(null);

/** Short notices that stack in a corner: at the top on phones, bottom right on wider screens. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const stack = useAnimatedToastStack({ defaultDuration: 4000, limit: 4 });
  const phone = useMediaQuery("(max-width: 767px)");
  const { showToast, updateToast, dismissToast } = stack;
  const toaster = useMemo<Toaster>(
    () => ({ show: showToast, update: updateToast, dismiss: dismissToast }),
    [showToast, updateToast, dismissToast],
  );
  return (
    <ToastContext.Provider value={toaster}>
      {children}
      <AnimatedToastStack
        toasts={stack.toasts}
        onDismiss={stack.dismissToast}
        position={phone ? "top-center" : "bottom-right"}
        fixed
        maxVisible={3}
        classNames={{
          root: "toast-stack",
          surface: "toast-surface",
          title: "toast-title",
          description: "toast-description",
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): Toaster {
  const toaster = useContext(ToastContext);
  if (!toaster) throw new Error("useToast needs a ToastProvider");
  return toaster;
}

/** `useAction`, with failures shown as an error toast. */
export function useToastAction() {
  const toast = useToast();
  return useAction((message) => toast.show({ title: message, status: "error" }));
}
