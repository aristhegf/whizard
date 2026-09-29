import { MotionConfig } from "motion/react";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { loadAccount } from "./account";
import { App } from "./App";
import { useReduceMotionSetting } from "./display";
import { ToastProvider } from "./ui/toast";
import "./styles.css";
import "./styles/tailwind.css";

void loadAccount();

/** Keeps animations still when the player turns on "Reduce animations", as well as the device. */
function Motion({ children }: { children: ReactNode }) {
  const still = useReduceMotionSetting();
  return <MotionConfig reducedMotion={still ? "always" : "user"}>{children}</MotionConfig>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Motion>
      <ToastProvider>
        <App />
      </ToastProvider>
    </Motion>
  </StrictMode>,
);
