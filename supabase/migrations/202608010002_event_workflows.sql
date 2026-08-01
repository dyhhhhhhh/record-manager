create or replace function public.confirm_order_event(
  p_event_id uuid,
  p_external_order_id text,
  p_ordered_at timestamptz,
  p_currency text,
  p_total numeric,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  event_row public.mail_events%rowtype;
  order_id uuid;
  item jsonb;
begin
  if owner_id is null or not public.is_app_owner() then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'items are required'; end if;

  select * into event_row
  from public.mail_events
  where id = p_event_id and user_id = owner_id and event_type = 'order_confirmation' and status = 'pending'
  for update;
  if not found then raise exception 'pending order event not found'; end if;

  insert into public.orders(user_id, external_order_id, ordered_at, currency, original_total, effective_total)
  values (owner_id, trim(p_external_order_id), p_ordered_at, upper(p_currency), p_total, p_total)
  returning id into order_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items(
      id, order_id, album_title, artist_name, unit_price, quantity, source_image_url, product_url
    ) values (
      (item->>'id')::uuid,
      order_id,
      trim(item->>'albumTitle'),
      trim(item->>'artistName'),
      (item->>'unitPrice')::numeric,
      coalesce((item->>'quantity')::integer, 1),
      nullif(item->>'imageUrl', ''),
      nullif(item->>'productUrl', '')
    );
  end loop;

  update public.mail_events
  set status = 'applied', related_order_id = order_id, applied_at = now()
  where id = p_event_id;

  return order_id;
end;
$$;

create or replace function public.apply_shipment_event(p_event_id uuid, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null or not public.is_app_owner() then raise exception 'not allowed'; end if;

  perform 1 from public.mail_events
  where id = p_event_id and user_id = owner_id and event_type = 'shipment' and status = 'pending'
  for update;
  if not found then raise exception 'pending shipment event not found'; end if;

  update public.orders
  set fulfillment_status = 'shipped'
  where id = p_order_id and user_id = owner_id and cancelled_at is null;
  if not found then raise exception 'active order not found'; end if;

  update public.mail_events
  set status = 'applied', related_order_id = p_order_id, applied_at = now()
  where id = p_event_id;
end;
$$;

create or replace function public.apply_cancellation_event(
  p_event_id uuid,
  p_order_id uuid,
  p_item_id uuid default null,
  p_effective_total numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null or not public.is_app_owner() then raise exception 'not allowed'; end if;

  perform 1 from public.mail_events
  where id = p_event_id and user_id = owner_id and event_type = 'cancellation' and status = 'pending'
  for update;
  if not found then raise exception 'pending cancellation event not found'; end if;

  if p_item_id is null then
    update public.orders set cancelled_at = now() where id = p_order_id and user_id = owner_id;
    if not found then raise exception 'order not found'; end if;
  else
    if p_effective_total is null or p_effective_total < 0 then raise exception 'adjusted total is required'; end if;
    update public.order_items
    set cancelled_at = now()
    where id = p_item_id
      and order_id = p_order_id
      and exists (select 1 from public.orders where id = p_order_id and user_id = owner_id);
    if not found then raise exception 'order item not found'; end if;
    update public.orders set effective_total = p_effective_total where id = p_order_id and user_id = owner_id;
  end if;

  update public.mail_events
  set status = 'applied', related_order_id = p_order_id, applied_at = now()
  where id = p_event_id;
end;
$$;

create or replace function public.set_order_item_cancellation(
  p_order_id uuid,
  p_item_id uuid,
  p_cancelled boolean,
  p_effective_total numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null or not public.is_app_owner() then raise exception 'not allowed'; end if;
  if p_effective_total is null or p_effective_total < 0 then raise exception 'adjusted total is required'; end if;

  update public.order_items
  set cancelled_at = case when p_cancelled then now() else null end
  where id = p_item_id
    and order_id = p_order_id
    and exists (select 1 from public.orders where id = p_order_id and user_id = owner_id);
  if not found then raise exception 'order item not found'; end if;

  update public.orders
  set effective_total = p_effective_total
  where id = p_order_id and user_id = owner_id;
end;
$$;

revoke all on function public.confirm_order_event(uuid, text, timestamptz, text, numeric, jsonb) from public;
revoke all on function public.apply_shipment_event(uuid, uuid) from public;
revoke all on function public.apply_cancellation_event(uuid, uuid, uuid, numeric) from public;
revoke all on function public.set_order_item_cancellation(uuid, uuid, boolean, numeric) from public;
grant execute on function public.confirm_order_event(uuid, text, timestamptz, text, numeric, jsonb) to authenticated;
grant execute on function public.apply_shipment_event(uuid, uuid) to authenticated;
grant execute on function public.apply_cancellation_event(uuid, uuid, uuid, numeric) to authenticated;
grant execute on function public.set_order_item_cancellation(uuid, uuid, boolean, numeric) to authenticated;
