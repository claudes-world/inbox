import type { ReactNode } from "react";

export type BadgeVariant =
  | "unread"
  | "read"
  | "acknowledged"
  | "hidden"
  | "to"
  | "cc"
  | "bcc"
  | "urgent"
  | "high"
  | "normal"
  | "low";

const variantClasses: Record<BadgeVariant, string> = {
  unread: "bg-blue-600 text-white",
  read: "bg-zinc-600 text-zinc-300",
  acknowledged: "bg-green-600 text-white",
  hidden: "bg-yellow-600 text-black",
  to: "bg-zinc-700 text-zinc-200",
  cc: "bg-zinc-800 text-zinc-400",
  bcc: "bg-zinc-800 text-zinc-500 italic",
  urgent: "bg-red-600 text-white",
  high: "bg-orange-600 text-white",
  normal: "bg-zinc-700 text-zinc-300",
  low: "bg-zinc-800 text-zinc-500",
};

export function Badge({
  variant,
  children,
}: {
  variant: BadgeVariant;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}
