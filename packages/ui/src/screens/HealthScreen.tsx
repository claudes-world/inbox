/**
 * Health Screen — system health dashboard with status indicators.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchDirectory } from "../api.js";
import { fetchInbox, fetchSent } from "../api.js";
import { Button } from "../components/primitives/Button.js";

interface HealthData {
  ok: boolean;
  service?: string;
}

function StatusDot({ status }: { status: "green" | "yellow" | "red" }) {
  const colors = {
    green: "bg-emerald-400",
    yellow: "bg-amber-400",
    red: "bg-red-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
}

function Row({ label, value, status }: { label: string; value: string; status?: "green" | "yellow" | "red" }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-700 last:border-b-0">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="flex items-center gap-2 text-sm text-zinc-200">
        {status && <StatusDot status={status} />}
        {value}
      </span>
    </div>
  );
}

export function HealthScreen({ address }: { address: string; navigate: (hash: string) => void }) {
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: async (): Promise<HealthData & { latencyMs: number }> => {
      const start = performance.now();
      const res = await fetch("/health");
      const latencyMs = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthData = await res.json();
      return { ...data, latencyMs };
    },
    refetchInterval: 30_000,
  });

  const dirQuery = useQuery({ queryKey: ["directory"], queryFn: fetchDirectory });
  const inboxQuery = useQuery({
    queryKey: ["inbox", address, "any", "any"],
    queryFn: () => fetchInbox(address, { state: "any", visibility: "any" }),
    enabled: !!address,
  });
  const sentQuery = useQuery({
    queryKey: ["sent", address, "any"],
    queryFn: () => fetchSent(address, { visibility: "any" }),
    enabled: !!address,
  });

  const bffOk = healthQuery.data?.ok === true;
  const bffStatus = healthQuery.isLoading ? "yellow" : bffOk ? "green" : "red";
  const dbStatus = bffOk ? "green" : healthQuery.isLoading ? "yellow" : "red";
  const addrCount = dirQuery.data?.items.length ?? 0;
  const inboxCount = inboxQuery.data?.returned_count ?? 0;
  const sentCount = sentQuery.data?.returned_count ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">System Health</h2>
        <Button variant="ghost" onClick={() => healthQuery.refetch()}>Refresh</Button>
      </div>

      <div className="bg-zinc-800 rounded-lg p-4 space-y-0">
        <Row label="BFF Service" value={bffOk ? "Healthy" : healthQuery.isLoading ? "Checking..." : "Unreachable"} status={bffStatus} />
        <Row label="BFF Version" value={healthQuery.data?.service ?? "—"} />
        <Row label="DB Connection" value={bffOk ? "Connected" : healthQuery.isLoading ? "Checking..." : "Unknown"} status={dbStatus} />
        <Row label="Response Time" value={healthQuery.data ? `${healthQuery.data.latencyMs}ms` : "—"} status={healthQuery.data ? (healthQuery.data.latencyMs < 200 ? "green" : healthQuery.data.latencyMs < 1000 ? "yellow" : "red") : undefined} />
        <Row label="Addresses" value={dirQuery.isLoading ? "..." : `${addrCount}`} />
        <Row label="Inbox Messages" value={inboxQuery.isLoading ? "..." : `${inboxCount}`} />
        <Row label="Sent Messages" value={sentQuery.isLoading ? "..." : `${sentCount}`} />
      </div>

      {healthQuery.isError && (
        <div className="text-xs text-red-400 font-mono bg-zinc-800 rounded-lg p-3">
          {healthQuery.error instanceof Error ? healthQuery.error.message : "Unknown error"}
        </div>
      )}
    </div>
  );
}
