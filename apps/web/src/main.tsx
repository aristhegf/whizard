import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadAccount } from "./account";
import { App } from "./App";
import { ToastProvider } from "./ui/toast";
import "./styles.css";
import "./styles/tailwind.css";

void loadAccount();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
