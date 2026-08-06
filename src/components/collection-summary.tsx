import { BadgePercent, CircleDollarSign, Disc3, ReceiptText, Truck } from "lucide-react";

type CollectionStat = {
  currency: string;
  total: string;
  recordsTotal: string;
  shippingTotal: string;
  additionalFeeTotal: string;
  taxTotal: string;
  orderCount: number;
  recordCount: number;
};

function money(currency: string, amount: string) {
  try {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}

const categories = [
  { key: "total", label: "总金额", icon: ReceiptText, tone: "bg-orange-50 text-[var(--accent)]" },
  { key: "recordsTotal", label: "唱片金额", icon: Disc3, tone: "bg-emerald-50 text-[var(--green)]" },
  { key: "shippingTotal", label: "运费", icon: Truck, tone: "bg-blue-50 text-blue-700" },
  { key: "additionalFeeTotal", label: "附加费", icon: CircleDollarSign, tone: "bg-violet-50 text-violet-700" },
  { key: "taxTotal", label: "已含税费", icon: BadgePercent, tone: "bg-amber-50 text-amber-700" }
] as const;

export function CollectionSummary({ stats }: { stats: readonly CollectionStat[] }) {
  if (!stats.length) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-[var(--line)] p-5 text-sm text-[var(--muted)] sm:mt-10">
        导入第一张订单后，这里会显示消费统计。
      </div>
    );
  }

  const orderCount = stats.reduce((sum, stat) => sum + stat.orderCount, 0);
  const recordCount = stats.reduce((sum, stat) => sum + stat.recordCount, 0);

  return (
    <section aria-label="消费统计" className="mt-8 sm:mt-10">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <article aria-label={category.label} className="flex min-w-0 flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_12px_35px_rgb(23_32_27/0.045)] sm:p-5" key={category.key}>
              <div className="flex items-center gap-2.5">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${category.tone}`}>
                  <Icon aria-hidden="true" size={17} strokeWidth={2} />
                </span>
                <h2 className="text-sm font-semibold tracking-tight sm:text-base">{category.label}</h2>
              </div>
              <dl className="mt-4 space-y-2.5">
                {stats.map((stat) => (
                  <div className="flex min-w-0 items-baseline justify-between gap-2 border-t border-black/[0.055] pt-2.5 first:border-t-0 first:pt-0" key={stat.currency}>
                    <dt className="text-[10px] font-bold tracking-[0.14em] text-[var(--muted)] sm:text-xs">{stat.currency}</dt>
                    <dd className="truncate text-sm font-bold tabular-nums sm:text-base">{money(stat.currency, stat[category.key])}</dd>
                  </div>
                ))}
              </dl>
              {category.key === "total" ? (
                <p className="mt-auto border-t border-[var(--line)] pt-3 text-[11px] leading-5 text-[var(--muted)] sm:text-xs">
                  {orderCount} 张订单 · {recordCount} 张唱片
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">税费已包含在总金额中；五张卡片是分类视图，不能直接相加。</p>
    </section>
  );
}
