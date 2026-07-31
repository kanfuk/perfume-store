"use client";

import Link from "next/link";
import { ArrowRight, Bell, CalendarRange, Home, type LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { formatCurrency } from "@/lib/format";
import type { AdminOrderSummary } from "@/lib/types";
import type { ProfitabilityCostStatus } from "@/components/admin/dashboard/admin-dashboard.types";
import {
  formatShortDateTime,
  getCostStatusCompactLabel,
  getCostStatusLabel,
  getCostStatusTone
} from "@/components/admin/dashboard/admin-dashboard.utils";

export function SectionIntro({
  title,
  subtitle,
  icon: Icon,
  action,
  helper
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  action?: ReactNode;
  helper?: string;
}) {
  return (
    <section className="max-w-full overflow-x-hidden rounded-[24px] border border-brand-100 bg-white/90 p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-[18px] bg-brand-100 p-3 text-brand-700">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-2xl font-bold text-brand-950">{title}</h2>
            <p className="copy-justified break-words text-sm text-brand-900/70">
              {subtitle}
            </p>
            {helper ? (
              <p className="copy-justified break-words rounded-[18px] bg-brand-50 px-3 py-2 text-sm text-brand-800">
                {helper}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="w-full lg:w-auto">{action}</div> : null}
      </div>
    </section>
  );
}

export function HomeActionCard({
  title,
  subtitle,
  badge,
  icon: Icon,
  tone,
  onClick
}: {
  title: string;
  subtitle: string;
  badge: string;
  icon: LucideIcon;
  tone: "rose" | "violet" | "amber" | "emerald" | "slate";
  onClick: () => void;
}) {
  const palette =
    tone === "rose"
      ? {
          gradientClass: "from-brand-50 to-white",
          iconTextClass: "text-brand-700",
          iconBgClass: "bg-brand-100"
        }
      : tone === "violet"
        ? {
            gradientClass: "from-violet-50 to-white",
            iconTextClass: "text-violet-700",
            iconBgClass: "bg-violet-100"
          }
        : tone === "amber"
          ? {
              gradientClass: "from-amber-50 to-white",
              iconTextClass: "text-amber-700",
              iconBgClass: "bg-amber-100"
            }
          : tone === "emerald"
            ? {
                gradientClass: "from-brand-50 to-white",
                iconTextClass: "text-brand-700",
                iconBgClass: "bg-brand-100"
              }
            : {
                gradientClass: "from-slate-50 to-white",
                iconTextClass: "text-slate-700",
                iconBgClass: "bg-slate-100"
              };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`max-w-full overflow-x-hidden rounded-[20px] border border-brand-100 bg-gradient-to-br ${palette.gradientClass} p-4 text-left shadow-soft transition hover:border-brand-200`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-2xl p-3 ${palette.iconBgClass} ${palette.iconTextClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="inline-flex min-h-8 items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-800">
          {badge}
        </span>
      </div>
      <div className="mt-4 min-w-0 space-y-2">
        <div className="break-words text-lg font-semibold text-brand-950">{title}</div>
        <p className="copy-justified break-words text-sm leading-6 text-brand-900/70">
          {subtitle}
        </p>
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-brand-800">
          Abrir
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}

export function QuickTaskRow({
  title,
  detail,
  icon: Icon,
  onClick
}: {
  title: string;
  detail: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-4 text-left transition hover:border-brand-200 sm:flex-nowrap"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-2xl bg-white p-3 text-brand-700 shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-brand-950">{title}</div>
          <div className="copy-justified mt-1 break-words text-xs text-brand-900/65">
            {detail}
          </div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-brand-500" />
    </button>
  );
}

export function AdminSectionTab({
  label,
  icon: Icon,
  badge,
  active,
  onClick
}: {
  label: string;
  icon: LucideIcon;
  badge: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-12 min-w-max items-center gap-2 rounded-xl border px-4 py-2 text-left text-sm font-semibold transition ${
        active
          ? "border-[#7357ff] bg-[#7357ff] text-white"
          : "border-[#e4e7ec] bg-white text-[#344054] hover:border-[#c1b6ff]"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? "bg-white/15 text-white/85" : "bg-[#f2f4f7] text-[#667085]"}`}>
        {badge}
      </span>
    </button>
  );
}

export function FilterChip({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "border-brand-600 bg-brand-600 text-white shadow-[0_10px_24px_rgba(107, 74, 38,0.18)]"
          : "border-brand-100 bg-brand-50 text-brand-800 hover:border-brand-200 hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}

export function SegmentedControl({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="inline-grid min-h-12 w-full grid-cols-2 gap-1 rounded-[20px] border border-brand-100 bg-brand-50 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`min-h-10 rounded-[16px] px-4 py-2 text-sm font-semibold transition ${
            value === option.value
              ? "bg-white text-brand-950 shadow-[0_10px_24px_rgba(17, 19, 24,0.08)]"
              : "text-brand-700/80"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CompactSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="min-w-0 space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700/75">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block min-h-12 w-full rounded-[18px] border border-brand-100 bg-white px-4 py-3 text-sm font-semibold text-brand-950 shadow-[0_8px_20px_rgba(17, 19, 24,0.04)] outline-none transition focus:border-brand-300"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ReportDateField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 max-w-full space-y-2 overflow-hidden">
      <span className="text-sm font-semibold text-brand-900">{label}</span>
      <div className="flex min-h-12 items-center gap-3 rounded-[18px] border border-brand-100 bg-brand-50 px-4 py-3 focus-within:border-brand-300 focus-within:bg-white">
        <CalendarRange className="h-4 w-4 shrink-0 text-brand-700/70" />
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="block w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-sm text-brand-950 outline-none"
        />
      </div>
    </label>
  );
}

export function HeroMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "rose" | "violet" | "amber" | "emerald";
}) {
  const palette =
    tone === "rose"
      ? {
          gradientClass: "from-white to-brand-50",
          iconBgClass: "bg-brand-100",
          iconTextClass: "text-brand-700"
        }
      : tone === "violet"
        ? {
            gradientClass: "from-white to-violet-50",
            iconBgClass: "bg-violet-100",
            iconTextClass: "text-violet-700"
          }
        : tone === "amber"
          ? {
              gradientClass: "from-white to-amber-50",
              iconBgClass: "bg-amber-100",
              iconTextClass: "text-amber-700"
            }
          : {
              gradientClass: "from-white to-brand-50",
              iconBgClass: "bg-brand-100",
              iconTextClass: "text-brand-700"
            };
  return (
    <article
      className={`max-w-full overflow-x-hidden rounded-[22px] border border-brand-100 bg-gradient-to-br ${palette.gradientClass} p-4 shadow-soft`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-brand-900/60">
            {label}
          </div>
          <div className="mt-2 break-words text-[1.8rem] font-bold leading-none text-brand-950">
            {value}
          </div>
        </div>
        <span
          className={`rounded-2xl p-2.5 shadow-sm ${palette.iconBgClass} ${palette.iconTextClass}`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-3 break-words text-xs leading-5 text-brand-900/65">{detail}</p>
    </article>
  );
}

export function FocusCard({
  title,
  text,
  icon: Icon,
  tone
}: {
  title: string;
  text: string;
  icon: LucideIcon;
  tone: "rose" | "violet" | "amber";
}) {
  const className =
    tone === "rose"
      ? "border-brand-100 bg-brand-50 text-brand-800"
      : tone === "violet"
        ? "border-violet-200 bg-violet-50 text-violet-800"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <article
      className={`max-w-full overflow-x-hidden rounded-[22px] border p-4 shadow-soft ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-white/80 p-3">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="break-words text-sm leading-6 opacity-90">{text}</p>
        </div>
      </div>
    </article>
  );
}

export function MiniHomeTab({
  title,
  value,
  active,
  onClick,
  tone
}: {
  title: string;
  value: string;
  active: boolean;
  onClick: () => void;
  tone: "rose" | "violet" | "amber";
}) {
  const palette =
    tone === "rose"
      ? active
        ? "bg-brand-600 text-white"
        : "bg-brand-50 text-brand-800"
      : tone === "violet"
        ? active
          ? "bg-violet-600 text-white"
          : "bg-violet-50 text-violet-800"
        : active
          ? "bg-amber-500 text-white"
          : "bg-amber-50 text-amber-800";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[88px] min-w-0 rounded-[20px] px-4 py-4 text-left shadow-soft transition ${palette}`}
    >
      <div className="break-words text-sm font-medium opacity-90">{title}</div>
      <div className="mt-2 break-words text-2xl font-bold">{value}</div>
    </button>
  );
}

export function CompactHistorySection({
  title,
  subtitle,
  orders,
  emptyText
}: {
  title: string;
  subtitle: string;
  orders: AdminOrderSummary[];
  emptyText: string;
}) {
  return (
    <details className="max-w-full overflow-x-hidden rounded-lg border border-brand-100 bg-white/90 p-5 shadow-soft">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-bold text-brand-950">{title}</h2>
          <p className="break-words text-sm text-brand-900/70">{subtitle}</p>
        </div>
        <StatusBadge tone="neutral" label={`${orders.length} registro(s)`} />
      </summary>

      <div className="mt-4 space-y-3">
        {orders.length === 0 ? <EmptyState text={emptyText} /> : null}
        {orders.map((order) => (
          <article
            key={order.id}
            className="rounded-lg border border-brand-100 bg-brand-50/60 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-brand-950">{order.clienteNombre}</div>
                <div className="mt-1 text-sm text-brand-900/65">{order.productoNombre}</div>
              </div>
              <StatusBadge
                tone={title.toLowerCase().includes("cancelados") ? "warning" : "neutral"}
                label={title.toLowerCase().includes("cancelados") ? "CANCELADO" : "CERRADO"}
              />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <MiniMetric label="Total" value={formatCurrency(order.total)} />
              <MiniMetric label="Pago" value={order.estadoPago} />
              <MiniMetric
                label="Fecha"
                value={formatShortDateTime(
                  order.fechaEntrega ?? order.fechaPago ?? order.fechaCancelacion ?? order.fechaPedido
                )}
              />
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}

export function SimpleFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50/60 px-4 py-3">
      <span className="text-sm text-brand-900/70">{label}</span>
      <span className="text-base font-semibold text-brand-950">{value}</span>
    </div>
  );
}

export function ProfitabilityBar({
  label,
  value,
  amount,
  maxAmount,
  tone
}: {
  label: string;
  value: string;
  amount: number;
  maxAmount: number;
  tone: "emerald" | "violet" | "amber";
}) {
  const width = maxAmount > 0 ? Math.max(8, Math.min(100, (amount / maxAmount) * 100)) : 0;
  const barClassName =
    tone === "violet" ? "bg-violet-500" : tone === "amber" ? "bg-amber-500" : "bg-brand-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-brand-950">{label}</div>
        <div className="text-sm font-semibold text-brand-700">{value}</div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-brand-100">
        <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[72px] flex-col justify-center rounded-[18px] border border-brand-100 bg-white px-3 py-3">
      <div className="text-[11px] uppercase tracking-wide text-brand-700/70">{label}</div>
      <div className="mt-1 text-sm font-semibold text-brand-950">{value}</div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-brand-100 bg-brand-50/50 p-4 text-sm text-brand-900/60">
      {text}
    </div>
  );
}

export function StatusBadge({
  tone,
  label
}: {
  tone: "pedido" | "warning" | "neutral";
  label: string;
}) {
  const classes =
    tone === "pedido"
      ? "bg-brand-100 text-brand-800"
      : tone === "warning"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex min-h-7 max-w-full items-center justify-center rounded-full px-3 py-1 text-center text-xs font-semibold leading-none ${classes}`}
    >
      {label}
    </span>
  );
}

export function CostStatusBadge({
  status,
  compact = false
}: {
  status: ProfitabilityCostStatus;
  compact?: boolean;
}) {
  return (
    <StatusBadge
      tone={getCostStatusTone(status)}
      label={compact ? getCostStatusCompactLabel(status) : getCostStatusLabel(status)}
    />
  );
}

export function BadgeStatusChip({
  badgeEnabled,
  badgeSupported,
  notificationPermission,
  isInstalledPwa,
  onClick,
  pendingCount,
  accessibilityLabel
}: {
  badgeEnabled: boolean;
  badgeSupported: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  isInstalledPwa: boolean;
  onClick?: () => void;
  pendingCount?: number;
  accessibilityLabel?: string;
}) {
  const label = badgeEnabled
    ? "Badge activo"
    : !badgeSupported
      ? "No compatible"
      : notificationPermission === "denied"
        ? "Permiso denegado"
        : !isInstalledPwa
          ? "Abrir desde inicio"
          : "Por activar";
  const className = badgeEnabled
    ? "border-brand-200 bg-brand-50 text-brand-800"
    : !badgeSupported || notificationPermission === "denied"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-violet-200 bg-violet-50 text-violet-800";
  const indicatorClassName = badgeEnabled
    ? "bg-brand-500"
    : !badgeSupported || notificationPermission === "denied"
      ? "bg-amber-500"
      : "bg-violet-500";
  const content = (
    <>
      <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-white/80 p-[2px]">
        <span className={`block h-full w-full rounded-full ${indicatorClassName}`} />
      </span>
      {typeof pendingCount === "number" && pendingCount > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
          {pendingCount > 9 ? "9+" : pendingCount}
        </span>
      ) : null}
      <Bell className="h-5 w-5" />
      <span className="sr-only">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={accessibilityLabel ?? label}
        aria-label={accessibilityLabel ?? label}
        className={`relative inline-flex h-12 w-12 items-center justify-center rounded-[18px] border transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(16,24,40,0.08)] ${className}`}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      title={accessibilityLabel ?? label}
      aria-label={accessibilityLabel ?? label}
      className={`relative inline-flex h-12 w-12 items-center justify-center rounded-[18px] border ${className}`}
    >
      {content}
    </span>
  );
}

export function HeaderIconButton({
  label,
  title,
  onClick,
  icon,
  disabled,
  accent = "default"
}: {
  label: string;
  title: string;
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
  accent?: "default" | "soft";
}) {
  const className =
    accent === "soft"
      ? "border-brand-100 bg-brand-50 text-brand-900"
      : "border-brand-100 bg-white text-brand-900";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-[18px] border transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(16,24,40,0.08)] disabled:cursor-not-allowed disabled:bg-brand-50 disabled:text-brand-500 ${className}`}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function MobileQuickHomeButton({
  href,
  label
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="fixed bottom-[calc(24px+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-brand-100 bg-white/95 text-brand-900 shadow-soft backdrop-blur md:hidden"
      aria-label={label}
      title={label}
    >
      <Home className="h-4 w-4" />
    </Link>
  );
}

export function StableHorizontalRail({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const lastScrollLeftRef = useRef(0);

  useEffect(() => {
    const rail = railRef.current;

    if (!rail) {
      return;
    }

    if (Math.abs(rail.scrollLeft - lastScrollLeftRef.current) > 1) {
      rail.scrollLeft = lastScrollLeftRef.current;
    }
  });

  return (
    <div
      ref={railRef}
      onScroll={(event) => {
        lastScrollLeftRef.current = event.currentTarget.scrollLeft;
      }}
      className={className}
    >
      {children}
    </div>
  );
}
