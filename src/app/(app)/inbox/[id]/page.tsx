import { redirect } from "next/navigation";

import { requireSupabaseData } from "@/lib/supabase/query-result";
import { orderDetailHref } from "@/lib/merchant";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function InboxEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("mail_events")
    .select("merchant,external_order_id")
    .eq("id", id)
    .maybeSingle();
  const event = requireSupabaseData(result, "读取邮件事件");
  redirect(event?.external_order_id ? orderDetailHref(event.merchant, event.external_order_id) : "/orders");
}
