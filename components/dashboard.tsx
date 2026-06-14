import type { ReactNode } from "react"

/* ── Layout ── */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <h1 className="text-[72px] leading-none font-black tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-zinc-500 mt-3 text-sm">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-3 shrink-0">{actions}</div>
      )}
    </div>
  )
}

/* ── Metrics ── */

export function MetricCard({
  label,
  value,
  color = "text-white",
  subtext,
}: {
  label: string
  value: ReactNode
  color?: string
  subtext?: ReactNode
}) {
  return (
    <div className="bg-[#050505] border border-white/10 rounded-[28px] p-6">
      <div className="text-[10px] tracking-[0.35em] text-zinc-600">{label}</div>
      <div className={`mt-5 text-5xl font-black ${color}`}>{value}</div>
      {subtext && <div className="text-zinc-500 text-xs mt-2">{subtext}</div>}
    </div>
  )
}

export function MetricsGrid({
  children,
  columns = 3,
  className = "",
}: {
  children: ReactNode
  columns?: 2 | 3 | 4 | 7
  className?: string
}) {
  const colClass =
    columns === 7
      ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-7"
      : columns === 4
        ? "grid-cols-2 xl:grid-cols-4"
        : columns === 2
          ? "grid-cols-2"
          : "grid-cols-1 sm:grid-cols-3"

  return (
    <div className={`grid ${colClass} gap-5 ${className}`}>{children}</div>
  )
}

/* ── Cards & empty states ── */

export function ListCard({
  children,
  className = "",
  dimmed = false,
}: {
  children: ReactNode
  className?: string
  dimmed?: boolean
}) {
  return (
    <div
      className={`bg-[#050505] border border-white/10 rounded-[30px] overflow-hidden transition-all ${
        dimmed ? "opacity-45 border-white/5" : ""
      } ${className}`}
    >
      {children}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#050505] border border-white/10 rounded-[30px] p-10 text-zinc-500 text-center">
      {children}
    </div>
  )
}

/* ── Buttons ── */

const btnBase =
  "rounded-3xl font-semibold transition inline-flex items-center justify-center"

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${btnBase} bg-cyan-400 hover:bg-cyan-300 text-black px-8 py-5 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${btnBase} bg-[#111] hover:bg-[#1a1a1a] border border-white/10 text-white px-8 py-5 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function ActionButton({
  children,
  variant = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "cyan" | "green" | "ghost"
}) {
  const variants = {
    default:
      "bg-[#111] hover:bg-[#1a1a1a] border border-white/10 text-white px-6 py-4 rounded-2xl font-semibold",
    cyan: "bg-cyan-400 hover:bg-cyan-300 text-black px-6 py-3 rounded-2xl font-semibold",
    green:
      "bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-2xl font-bold",
    ghost:
      "bg-[#111] hover:bg-[#1a1a1a] border border-white/10 text-white px-6 py-4 rounded-2xl font-semibold",
  }

  return (
    <button className={`transition ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

/* ── Filter tabs ── */

export type FilterTabItem<T extends string> = {
  key: T
  label: string
}

export function FilterTabs<T extends string>({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: FilterTabItem<T>[]
  active: T
  onChange: (key: T) => void
  className?: string
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-2xl px-5 py-2.5 text-sm font-semibold border transition ${
            active === key
              ? "bg-[#0D0D12] text-cyan-400 border-[#1B1B22]"
              : "bg-[#111] text-zinc-400 border-white/10 hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/* ── Labels & inputs ── */

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] tracking-[0.35em] text-zinc-600">{children}</div>
  )
}

export function DashboardInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white outline-none ${className}`}
    />
  )
}

export function ModalPanel({
  children,
  className = "max-w-md",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div
        className={`w-full bg-[#050505] border border-white/10 rounded-[32px] p-8 ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
