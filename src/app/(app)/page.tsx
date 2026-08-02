import { Disc3, PackageCheck, Search } from "lucide-react";
import Link from "next/link";

import { CollectionSummary } from "@/components/collection-summary";
import { CoverImage } from "@/components/cover-image";
import { buildCollection } from "@/features/orders/collection";
import { formatShanghaiDate } from "@/lib/date-time";
import { clampPage } from "@/lib/pagination";
import { requireSupabaseData } from "@/lib/supabase/query-result";
import { MERCHANT_LABELS, orderDetailHref } from "@/lib/merchant";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 24;

function money(currency: string, amount: string | number) {
  try {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const supabase = await createSupabaseServerClient();
  const orderResult = await supabase
    .from("orders")
    .select("id,merchant,external_order_id,ordered_at,currency,effective_total,shipping_total,tax_total,fulfillment_status,cancelled_at,order_items(id,album_title,artist_name,unit_price,quantity,image_path,cancelled_at)")
    .order("ordered_at", { ascending: false });
  const orders = requireSupabaseData(orderResult, "读取唱片订单") ?? [];

  const collection = buildCollection(orders, query);
  const pageCount = Math.max(1, Math.ceil(collection.records.length / PAGE_SIZE));
  const page = clampPage(typeof params.page === "string" ? params.page : undefined, pageCount);
  const records = collection.records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const imagePaths = records.map((record) => record.image_path).filter((path): path is string => Boolean(path));
  const { data: signed } = imagePaths.length
    ? await supabase.storage.from("album-covers").createSignedUrls(imagePaths, 3600)
    : { data: [] };
  const signedUrls = new Map((signed ?? []).map((entry) => [entry.path, entry.signedUrl]));

  return (
    <section>
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Collection ledger</p>
          <h1 className="mt-2 max-w-4xl text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">买过什么，一眼就知道。</h1>
          <p className="mt-4 text-[var(--muted)]">只显示有效购买；取消的订单和唱片会自动隐藏。</p>
        </div>
        <form className="flex h-12 w-full items-center rounded-full border border-[var(--line)] bg-white px-4 shadow-sm lg:w-80">
          <Search className="text-[var(--muted)]" size={18} />
          <input aria-label="搜索专辑、艺人或订单" className="min-w-0 flex-1 bg-transparent px-3 outline-none" defaultValue={query} name="q" placeholder="专辑、艺人或订单号" />
        </form>
      </div>

      <CollectionSummary stats={collection.stats} />

      {records.length ? (
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {records.map((record) => {
            const imageUrl = record.image_path ? signedUrls.get(record.image_path) : null;
            return (
              <Link className="group min-w-0" href={orderDetailHref(record.merchant, record.external_order_id)} key={record.id}>
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-black/10 bg-[#ddd9cd] shadow-[0_12px_35px_rgb(23_32_27/0.12)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_18px_42px_rgb(23_32_27/0.2)]">
                  {imageUrl ? (
                    <CoverImage alt={`${record.artist_name}《${record.album_title}》封面`} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 17vw" src={imageUrl} />
                  ) : (
                    <span className="grid h-full place-items-center"><Disc3 className="text-black/25" size={58} strokeWidth={1.2} /></span>
                  )}
                  {record.fulfillment_status === "received" ? <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90 text-emerald-800 shadow"><PackageCheck size={17} /></span> : null}
                  {record.quantity > 1 ? <span className="absolute bottom-2 right-2 rounded-full bg-black/75 px-2 py-1 text-xs font-bold text-white">×{record.quantity}</span> : null}
                </div>
                <h2 className="mt-3 truncate font-semibold">{record.album_title}</h2>
                <p className="mt-1 truncate text-sm text-[var(--muted)]">{record.artist_name}</p>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[var(--accent)]">{money(record.currency, record.unit_price)}</span>
                  <span className="text-[var(--muted)]">{MERCHANT_LABELS[record.merchant]} · <time>{formatShanghaiDate(record.ordered_at)}</time></span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-10 rounded-3xl border border-dashed border-[var(--line)] py-24 text-center">
          <Disc3 className="mx-auto text-black/25" size={48} />
          <h2 className="mt-4 text-xl font-semibold">{query ? "没有找到匹配的唱片" : "还没有唱片记录"}</h2>
          <p className="mt-2 text-[var(--muted)]">{query ? "换一个专辑名、艺人或订单号试试。" : "前往订单页面同步并导入受支持商家的订单。"}</p>
        </div>
      )}

      {pageCount > 1 ? (
        <nav className="mt-12 flex items-center justify-center gap-3 text-sm font-semibold">
          {page > 1 ? <Link className="rounded-full border border-[var(--line)] bg-white px-4 py-2" href={`/?q=${encodeURIComponent(query)}&page=${page - 1}`}>上一页</Link> : null}
          <span>{page} / {pageCount}</span>
          {page < pageCount ? <Link className="rounded-full border border-[var(--line)] bg-white px-4 py-2" href={`/?q=${encodeURIComponent(query)}&page=${page + 1}`}>下一页</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
