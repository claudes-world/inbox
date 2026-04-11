import type { ReactNode, ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 border border-blue-500",
  secondary:
    "bg-zinc-700 text-zinc-200 hover:bg-zinc-600 active:bg-zinc-800 border border-zinc-600",
  ghost:
    "bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 border border-transparent",
};

export function Button({
  variant = "secondary",
  children,
  className,
  ...props
}: {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
