import type { AddressKind } from "@inbox/contracts";

const kindIcons: Record<AddressKind, string> = {
  agent: "\u{1F916}",
  human: "\u{1F464}",
  service: "\u2699\uFE0F",
  list: "\u{1F4CB}",
};

export function AddressChip({
  address,
  kind,
  displayName,
}: {
  address: string;
  kind: AddressKind;
  displayName?: string | null;
}) {
  const icon = kindIcons[kind] ?? "\u{1F4E8}";
  const label = displayName || address;

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 text-xs"
      title={address}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="truncate max-w-[12rem]">{label}</span>
      <span className="font-mono text-zinc-500 text-[0.65rem]">
        {address}
      </span>
    </span>
  );
}
