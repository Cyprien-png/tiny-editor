import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export const cx = (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 border-transparent",
  secondary: "bg-surface text-ink border-line hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-bad-soft text-bad border-transparent hover:brightness-105",
};

export function Button({ variant = "secondary", size = "md", className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 px-2.5 text-[13px] gap-1.5", md: "h-9 px-3.5 text-sm gap-2", lg: "h-11 px-5 text-base gap-2" };
  return (
    <button
      className={cx("inline-flex items-center justify-center rounded-lg border font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none", VARIANTS[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx("inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors disabled:opacity-50", className)} {...props}>
      {children}
    </button>
  );
}

const CHEVRON = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="#8a857d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5l5 5 5-5"/></svg>')}")`;

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx("h-9 appearance-none rounded-lg border border-line bg-surface bg-no-repeat pl-3 pr-9 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40", className)}
      // Its own chevron, with room on its right: the browser's one sticks to the edge.
      {...props}
      style={{ backgroundImage: CHEVRON, backgroundPosition: "right 0.7rem center", backgroundSize: "0.8rem", ...props.style }}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
      <span className={cx("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", checked ? "bg-accent" : "bg-line-strong")}>
        <span className={cx("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </span>
      {label}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded border border-line-strong bg-surface-2 font-mono text-[11px] text-ink-2">{children}</kbd>;
}
