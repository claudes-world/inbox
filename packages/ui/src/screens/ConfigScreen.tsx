/**
 * Config Screen — read-only configuration explorer.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchDirectory } from "../api.js";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-700 last:border-b-0">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className={`text-sm text-zinc-200 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export function ConfigScreen({ address }: { address: string; navigate: (hash: string) => void }) {
  const dirQuery = useQuery({ queryKey: ["directory"], queryFn: fetchDirectory });
  const addresses = dirQuery.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold text-zinc-100">Configuration</h2>

      <Section title="Identity">
        <Row label="Current Address" value={address || "—"} mono />
        <Row label="Available Addresses" value={dirQuery.isLoading ? "Loading..." : `${addresses.length}`} />
        {addresses.map((a) => (
          <Row key={a.address} label={a.display_name ?? a.kind} value={a.address} mono />
        ))}
      </Section>

      <Section title="Connection">
        <Row label="API Base URL" value={window.location.origin} mono />
        <Row label="Health Endpoint" value="/health" mono />
        <Row label="App Version" value="0.1.0" />
        <Row label="Protocol" value={window.location.protocol.replace(":", "")} />
      </Section>

      <Section title="Feature Flags">
        <div className="text-sm text-zinc-500 py-2">No feature flags configured</div>
      </Section>
    </div>
  );
}
