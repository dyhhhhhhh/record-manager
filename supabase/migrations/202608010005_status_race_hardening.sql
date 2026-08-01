create or replace function public.confirm_order_event(
  p_event_id uuid,
  p_external_order_id text,
  p_ordered_at timestamptz,
  p_currency text,
  p_items_subtotal numeric,
  p_shipping_total numeric,
  p_shipping_method text,
  p_tax_total numeric,
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
  initial_fulfillment public.fulfillment_status := 'ordered';
begin
  if owner_id is null or not public.is_app_owner() then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'items are required'; end if;
  if p_items_subtotal < 0 or p_shipping_total < 0 or p_tax_total < 0 or p_total < 0 then
    raise exception 'amounts must be non-negative';
  end if;

  select * into event_row
  from public.mail_events
  where id = p_event_id and user_id = owner_id and event_type = 'order_confirmation'
  for update;
  if not found then raise exception 'order event not found'; end if;

  if event_row.status = 'applied' and event_row.related_order_id is not null then
    return event_row.related_order_id;
  end if;
  if event_row.status <> 'pending' then raise exception 'pending order event not found'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(owner_id::text || ':imusic:' || coalesce(event_row.external_order_id, ''), 0)
  );

  if exists (
    select 1
    from public.mail_events cancellation
    where cancellation.user_id = owner_id
      and cancellation.external_order_id = event_row.external_order_id
      and cancellation.event_type = 'cancellation'
      and cancellation.status <> 'ignored'
  ) then
    raise exception 'cancelled orders cannot be imported';
  end if;

  if exists (
    select 1
    from public.mail_events shipment
    where shipment.user_id = owner_id
      and shipment.external_order_id = event_row.external_order_id
      and shipment.event_type = 'shipment'
      and shipment.status <> 'ignored'
  ) then
    initial_fulfillment := 'shipped';
  end if;

  insert into public.orders(
    user_id,
    external_order_id,
    ordered_at,
    currency,
    items_subtotal,
    shipping_total,
    shipping_method,
    tax_total,
    original_total,
    effective_total,
    fulfillment_status
  ) values (
    owner_id,
    trim(p_external_order_id),
    p_ordered_at,
    upper(p_currency),
    p_items_subtotal,
    p_shipping_total,
    nullif(trim(p_shipping_method), ''),
    p_tax_total,
    p_total,
    p_total,
    initial_fulfillment
  ) returning id into order_id;

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
  set external_order_id = trim(p_external_order_id),
      status = 'applied',
      related_order_id = order_id,
      applied_at = now()
  where user_id = owner_id
    and external_order_id = event_row.external_order_id
    and event_type in ('order_confirmation', 'shipment')
    and status = 'pending';

  return order_id;
end;
$$;

drop function public.apply_mail_event_status(uuid, uuid);

create function public.apply_mail_event_status(p_user_id uuid, p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.mail_events%rowtype;
  order_id uuid;
begin
  if auth.role() <> 'service_role'
    and (auth.uid() is distinct from p_user_id or not public.is_app_owner()) then
    raise exception 'not allowed';
  end if;

  select * into event_row
  from public.mail_events
  where id = p_event_id
    and user_id = p_user_id
    and event_type in ('shipment', 'cancellation');
  if not found then raise exception 'status event not found'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':imusic:' || coalesce(event_row.external_order_id, ''), 0)
  );

  select * into event_row
  from public.mail_events
  where id = p_event_id
    and user_id = p_user_id
    and event_type in ('shipment', 'cancellation')
  for update;
  if not found then raise exception 'status event not found'; end if;
  if event_row.status = 'applied' then return true; end if;
  if event_row.status <> 'pending' then raise exception 'pending status event not found'; end if;

  select id into order_id
  from public.orders
  where user_id = p_user_id
    and merchant = 'imusic'
    and external_order_id = event_row.external_order_id
  for update;
  if not found then return false; end if;

  if event_row.event_type = 'shipment' then
    update public.orders
    set fulfillment_status = case
      when fulfillment_status = 'ordered' and cancelled_at is null then 'shipped'
      else fulfillment_status
    end
    where id = order_id;
  else
    update public.orders
    set cancelled_at = coalesce(cancelled_at, event_row.received_at)
    where id = order_id;
  end if;

  update public.mail_events
  set status = 'applied', related_order_id = order_id, applied_at = now()
  where id = event_row.id;

  return true;
end;
$$;

revoke all on function public.confirm_order_event(uuid, text, timestamptz, text, numeric, numeric, text, numeric, numeric, jsonb) from public;
revoke all on function public.apply_mail_event_status(uuid, uuid) from public;
grant execute on function public.confirm_order_event(uuid, text, timestamptz, text, numeric, numeric, text, numeric, numeric, jsonb) to authenticated;
grant execute on function public.apply_mail_event_status(uuid, uuid) to authenticated, service_role;
