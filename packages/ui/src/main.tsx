import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Skip retries on contract drift — it's a deterministic bug, not a
      // flaky network. Use `error.name` check, NOT `instanceof`, because
      // webpack/vite can duplicate the ContractDriftError class across
      // bundle boundaries and break the `instanceof` identity.
      retry: (failureCount, error) => {
        if (error instanceof Error && error.name === "ContractDriftError") {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
