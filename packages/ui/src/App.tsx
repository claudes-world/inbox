/**
 * App shell — routing, navigation, and identity selector.
 */
import { useHash, matchRoute, hashQuery } from "./hooks/useHash.js";
import { useIdentity } from "./hooks/useIdentity.js";
import { InboxScreen } from "./screens/InboxScreen.js";
import { MessageReadScreen } from "./screens/MessageReadScreen.js";
import { ComposeScreen } from "./screens/ComposeScreen.js";
import { ThreadScreen } from "./screens/ThreadScreen.js";
import { SentScreen } from "./screens/SentScreen.js";
import { SentReadScreen } from "./screens/SentReadScreen.js";
import { DirectoryScreen } from "./screens/DirectoryScreen.js";

function NavLink({
  hash,
  currentHash,
  label,
  navigate,
}: {
  hash: string;
  currentHash: string;
  label: string;
  navigate: (h: string) => void;
}) {
  const isActive =
    hash === "/"
      ? currentHash === "/" || currentHash === ""
      : currentHash.startsWith(hash);

  return (
    <button
      type="button"
      onClick={() => navigate(hash)}
      className={`px-3 py-1 rounded text-sm transition-colors cursor-pointer ${
        isActive
          ? "bg-zinc-700 text-zinc-100 font-medium"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );
}

export function App() {
  const [hash, setHash] = useHash();
  const { address, setAddress, addresses, isLoading: identityLoading } = useIdentity();

  const navigate = (h: string) => setHash(h);
  const path = hash || "/";

  // Route matching
  const messageMatch = matchRoute("/message/:id", path);
  const threadMatch = matchRoute("/thread/:id", path);
  const sentReadMatch = matchRoute("/sent/:id", path);
  const query = hashQuery(hash);

  const renderScreen = () => {
    if (!address) {
      if (identityLoading) {
        return (
          <div className="flex items-center justify-center py-12 text-zinc-500">
            <span className="animate-pulse">Loading identity...</span>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center gap-3 py-12 text-zinc-400">
          <span>No addresses found in directory</span>
          <span className="text-xs text-zinc-600">
            The BFF needs at least one address registered.
          </span>
        </div>
      );
    }

    if (messageMatch?.id) {
      return (
        <MessageReadScreen
          address={address}
          messageId={messageMatch.id}
          navigate={navigate}
        />
      );
    }

    if (threadMatch?.id) {
      return (
        <ThreadScreen
          address={address}
          conversationId={threadMatch.id}
          navigate={navigate}
        />
      );
    }

    if (path.startsWith("/compose")) {
      return (
        <ComposeScreen
          address={address}
          replyToId={query.reply}
          navigate={navigate}
        />
      );
    }

    if (sentReadMatch?.id) {
      return (
        <SentReadScreen
          address={address}
          messageId={sentReadMatch.id}
          navigate={navigate}
        />
      );
    }

    if (path === "/sent") {
      return (
        <SentScreen address={address} navigate={navigate} />
      );
    }

    if (path === "/directory") {
      return (
        <DirectoryScreen address={address} navigate={navigate} />
      );
    }

    // Default: Inbox
    return <InboxScreen address={address} navigate={navigate} />;
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Title */}
          <h1
            className="text-lg font-semibold tracking-tight cursor-pointer"
            onClick={() => navigate("/")}
          >
            Inbox
          </h1>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            <NavLink
              hash="/"
              currentHash={path}
              label="Inbox"
              navigate={navigate}
            />
            <NavLink
              hash="/sent"
              currentHash={path}
              label="Sent"
              navigate={navigate}
            />
            <NavLink
              hash="/compose"
              currentHash={path}
              label="Compose"
              navigate={navigate}
            />
            <NavLink
              hash="/directory"
              currentHash={path}
              label="Directory"
              navigate={navigate}
            />
          </nav>

          <div className="flex-1" />

          {/* Identity selector */}
          {addresses.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Acting as:</span>
              <select
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1 text-xs font-mono max-w-[200px]"
              >
                {addresses.map((a) => (
                  <option key={a.address} value={a.address}>
                    {a.display_name
                      ? `${a.display_name} (${a.address})`
                      : a.address}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main>{renderScreen()}</main>
    </div>
  );
}
