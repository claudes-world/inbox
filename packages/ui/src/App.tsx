import { useState } from "react";
import { InboxPanel } from "./components/panels/InboxPanel.js";
import { ThreadPanel } from "./components/panels/ThreadPanel.js";

export function App() {
  const [activeThread, setActiveThread] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">
          Inbox — Operator's Console
        </h1>
      </header>
      <main>
        {activeThread ? (
          <ThreadPanel
            conversationId={activeThread}
            onBack={() => setActiveThread(null)}
          />
        ) : (
          <InboxPanel onSelectThread={setActiveThread} />
        )}
      </main>
    </div>
  );
}
