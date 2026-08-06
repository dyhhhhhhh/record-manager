alter table public.mail_events
  drop constraint if exists mail_events_merchant_check,
  add constraint mail_events_merchant_check
    check (merchant in ('imusic', 'hmv', 'mutant', 'black_screen', 'laced', 'cdjapan'));

alter table public.orders
  drop constraint if exists orders_merchant_check,
  add constraint orders_merchant_check
    check (merchant in ('imusic', 'hmv', 'mutant', 'black_screen', 'laced', 'cdjapan')),
  add column additional_fee_total numeric(14, 2) not null default 0
    check (additional_fee_total >= 0);

alter table public.order_items
  add column merchant_item_id text;

create index order_items_merchant_item_idx
  on public.order_items(order_id, merchant_item_id)
  where merchant_item_id is not null;

create or replace function public.refresh_cdjapan_shipment_coverage(
  p_user_id uuid,
  p_external_order_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  packaged_complete boolean := false;
  unkeyed_complete boolean := false;
begin
  if auth.role() <> 'service_role'
    and (auth.uid() is distinct from p_user_id or not public.is_app_owner()) then
    raise exception 'not allowed';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':cdjapan:' || trim(p_external_order_id), 0)
  );

  select id into target_order_id
  from public.orders
  where user_id = p_user_id
    and merchant = 'cdjapan'
    and external_order_id = trim(p_external_order_id)
  for update;
  if not found then return null; end if;

  with trusted_events as (
    select event.id, event.received_at, event.parsed_payload
    from public.mail_events event
    where event.user_id = p_user_id
      and event.merchant = 'cdjapan'
      and event.external_order_id = trim(p_external_order_id)
      and event.event_type = 'shipment'
      and event.authentication_verified
      and event.status = 'applied'
      and jsonb_typeof(event.parsed_payload->'shipmentItems') = 'array'
      and event.parsed_payload->>'packageKey' ~ '^[a-f0-9]{64}$'
  ), distinct_packages as (
    select distinct on (parsed_payload->>'packageKey') parsed_payload
    from trusted_events
    order by parsed_payload->>'packageKey', received_at, id
  ), shipped_quantities as (
    select shipment_item->>'merchantItemId' as merchant_item_id,
      sum((shipment_item->>'quantity')::integer) as quantity
    from distinct_packages package
    cross join lateral jsonb_array_elements(package.parsed_payload->'shipmentItems') shipment_item
    where shipment_item->>'merchantItemId' is not null
      and shipment_item->>'quantity' ~ '^[1-9][0-9]*$'
    group by shipment_item->>'merchantItemId'
  ), ordered_quantities as (
    select item.merchant_item_id, sum(item.quantity) as quantity
    from public.order_items item
    where item.order_id = target_order_id
      and item.merchant_item_id is not null
    group by item.merchant_item_id
  )
  select exists (select 1 from distinct_packages)
    and not exists (
      select 1 from public.order_items item
      where item.order_id = target_order_id and item.merchant_item_id is null
    )
    and not exists (
      select 1
      from ordered_quantities ordered
      where coalesce((
        select shipped.quantity
        from shipped_quantities shipped
        where shipped.merchant_item_id = ordered.merchant_item_id
      ), 0) < ordered.quantity
    )
  into packaged_complete;

  with unkeyed_events as (
    select event.parsed_payload
    from public.mail_events event
    where event.user_id = p_user_id
      and event.merchant = 'cdjapan'
      and event.external_order_id = trim(p_external_order_id)
      and event.event_type = 'shipment'
      and event.authentication_verified
      and event.status = 'applied'
      and jsonb_typeof(event.parsed_payload->'shipmentItems') = 'array'
      and coalesce(event.parsed_payload->>'packageKey', '') = ''
  )
  select exists (
    select 1
    from unkeyed_events shipment
    where not exists (
      select 1 from public.order_items item
      where item.order_id = target_order_id and item.merchant_item_id is null
    ) and not exists (
      select 1
      from (
        select item.merchant_item_id, sum(item.quantity) as quantity
        from public.order_items item
        where item.order_id = target_order_id
        group by item.merchant_item_id
      ) ordered
      where coalesce((
            select sum((shipment_item->>'quantity')::integer)
            from jsonb_array_elements(shipment.parsed_payload->'shipmentItems') shipment_item
            where shipment_item->>'merchantItemId' = ordered.merchant_item_id
              and shipment_item->>'quantity' ~ '^[1-9][0-9]*$'
          ), 0) < ordered.quantity
    )
  ) into unkeyed_complete;

  if packaged_complete or unkeyed_complete then
    update public.orders
    set fulfillment_status = 'shipped'
    where id = target_order_id
      and fulfillment_status = 'ordered'
      and cancelled_at is null;
  end if;

  return target_order_id;
end;
$$;

drop function if exists public.confirm_order_event(uuid, text, timestamptz, text, numeric, numeric, text, numeric, numeric, numeric, jsonb);
drop function if exists public.confirm_order_event(uuid, text, timestamptz, text, numeric, numeric, numeric, text, numeric, numeric, numeric, jsonb);

create function public.confirm_order_event(
  p_event_id uuid,
  p_external_order_id text,
  p_ordered_at timestamptz,
  p_currency text,
  p_items_subtotal numeric,
  p_shipping_total numeric,
  p_additional_fee_total numeric,
  p_shipping_method text,
  p_discount_total numeric,
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
  if p_items_subtotal < 0 or p_shipping_total < 0 or p_additional_fee_total < 0
    or p_discount_total < 0 or p_tax_total < 0 or p_total < 0 then
    raise exception 'amounts must be non-negative';
  end if;
  if p_items_subtotal + p_shipping_total + p_additional_fee_total - p_discount_total <> p_total then
    raise exception 'order total does not reconcile';
  end if;
  if (
    select coalesce(sum((entry->>'unitPrice')::numeric * coalesce((entry->>'quantity')::integer, 1)), 0)
    from jsonb_array_elements(p_items) as items(entry)
  ) <> p_items_subtotal then
    raise exception 'item total does not reconcile';
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
    hashtextextended(owner_id::text || ':' || event_row.merchant || ':' || coalesce(event_row.external_order_id, ''), 0)
  );

  if exists (
    select 1 from public.mail_events cancellation
    where cancellation.user_id = owner_id
      and cancellation.merchant = event_row.merchant
      and cancellation.external_order_id = event_row.external_order_id
      and cancellation.event_type = 'cancellation'
      and (
        cancellation.status = 'applied'
        or (cancellation.status = 'pending' and cancellation.authentication_verified)
      )
  ) then
    raise exception 'cancelled orders cannot be imported';
  end if;

  if event_row.merchant <> 'cdjapan' and exists (
    select 1 from public.mail_events shipment
    where shipment.user_id = owner_id
      and shipment.merchant = event_row.merchant
      and shipment.external_order_id = event_row.external_order_id
      and shipment.event_type = 'shipment'
      and (
        shipment.status = 'applied'
        or (shipment.status = 'pending' and shipment.authentication_verified)
      )
  ) then
    initial_fulfillment := 'shipped';
  end if;

  insert into public.orders(
    user_id, merchant, external_order_id, ordered_at, currency, items_subtotal,
    shipping_total, additional_fee_total, shipping_method, discount_total, tax_total,
    original_total, effective_total, fulfillment_status
  ) values (
    owner_id, event_row.merchant, trim(p_external_order_id), p_ordered_at, upper(p_currency), p_items_subtotal,
    p_shipping_total, p_additional_fee_total, nullif(trim(p_shipping_method), ''), p_discount_total, p_tax_total,
    p_total, p_total, initial_fulfillment
  ) returning id into order_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items(
      id, order_id, merchant_item_id, album_title, artist_name, unit_price, quantity,
      source_image_url, product_url
    ) values (
      (item->>'id')::uuid, order_id, nullif(trim(item->>'merchantItemId'), ''),
      trim(item->>'albumTitle'), trim(item->>'artistName'),
      (item->>'unitPrice')::numeric, coalesce((item->>'quantity')::integer, 1),
      nullif(item->>'imageUrl', ''), nullif(item->>'productUrl', '')
    );
  end loop;

  update public.mail_events
  set external_order_id = trim(p_external_order_id), status = 'applied',
      related_order_id = order_id, applied_at = now()
  where user_id = owner_id
    and merchant = event_row.merchant
    and external_order_id = event_row.external_order_id
    and status = 'pending'
    and (
      event_type = 'order_confirmation'
      or (event_type = 'shipment' and authentication_verified)
    );

  if event_row.merchant = 'cdjapan' then
    perform public.refresh_cdjapan_shipment_coverage(owner_id, trim(p_external_order_id));
  end if;

  return order_id;
end;
$$;

create or replace function public.apply_mail_event_status(p_user_id uuid, p_event_id uuid)
returns uuid
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

  select * into event_row from public.mail_events
  where id = p_event_id and user_id = p_user_id and event_type in ('shipment', 'cancellation');
  if not found then raise exception 'status event not found'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || event_row.merchant || ':' || coalesce(event_row.external_order_id, ''), 0)
  );

  select * into event_row from public.mail_events
  where id = p_event_id and user_id = p_user_id and event_type in ('shipment', 'cancellation')
  for update;
  if not found then raise exception 'status event not found'; end if;
  if event_row.status = 'applied' then return event_row.related_order_id; end if;
  if event_row.status <> 'pending' then raise exception 'pending status event not found'; end if;
  if not event_row.authentication_verified then raise exception 'unverified status event'; end if;

  select id into order_id from public.orders
  where user_id = p_user_id
    and merchant = event_row.merchant
    and external_order_id = event_row.external_order_id
  for update;
  if not found then return null; end if;

  if event_row.event_type = 'shipment' and event_row.merchant <> 'cdjapan' then
    update public.orders
    set fulfillment_status = case
      when fulfillment_status = 'ordered' and cancelled_at is null then 'shipped'
      else fulfillment_status
    end
    where id = order_id;
  elsif event_row.event_type = 'cancellation' then
    update public.orders set cancelled_at = coalesce(cancelled_at, event_row.received_at)
    where id = order_id;
  end if;

  update public.mail_events
  set status = 'applied', related_order_id = order_id, applied_at = now()
  where id = event_row.id;

  if event_row.event_type = 'shipment' and event_row.merchant = 'cdjapan' then
    perform public.refresh_cdjapan_shipment_coverage(p_user_id, event_row.external_order_id);
  end if;

  return order_id;
end;
$$;

drop function if exists public.update_order_details(uuid, text, timestamptz, text, numeric, numeric, text, numeric, numeric, numeric, numeric);
drop function if exists public.update_order_details(uuid, text, timestamptz, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric);

create function public.update_order_details(
  p_order_id uuid,
  p_external_order_id text,
  p_ordered_at timestamptz,
  p_currency text,
  p_items_subtotal numeric,
  p_shipping_total numeric,
  p_additional_fee_total numeric,
  p_shipping_method text,
  p_discount_total numeric,
  p_tax_total numeric,
  p_original_total numeric,
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
  if p_items_subtotal < 0 or p_shipping_total < 0 or p_additional_fee_total < 0
    or p_discount_total < 0 or p_tax_total < 0
    or p_original_total < 0 or p_effective_total < 0 then
    raise exception 'amounts must be non-negative';
  end if;
  if p_items_subtotal + p_shipping_total + p_additional_fee_total - p_discount_total <> p_original_total then
    raise exception 'order total does not reconcile';
  end if;

  perform 1 from public.orders where id = p_order_id and user_id = owner_id for update;
  if not found then raise exception 'order not found'; end if;

  update public.orders
  set external_order_id = trim(p_external_order_id), ordered_at = p_ordered_at,
      currency = upper(p_currency), items_subtotal = p_items_subtotal,
      shipping_total = p_shipping_total, additional_fee_total = p_additional_fee_total,
      shipping_method = nullif(trim(p_shipping_method), ''),
      discount_total = p_discount_total, tax_total = p_tax_total,
      original_total = p_original_total, effective_total = p_effective_total
  where id = p_order_id;

  update public.mail_events set external_order_id = trim(p_external_order_id)
  where user_id = owner_id and related_order_id = p_order_id;
end;
$$;

revoke all on function public.refresh_cdjapan_shipment_coverage(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.confirm_order_event(uuid, text, timestamptz, text, numeric, numeric, numeric, text, numeric, numeric, numeric, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.apply_mail_event_status(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.update_order_details(uuid, text, timestamptz, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric) from public, anon, authenticated, service_role;
grant execute on function public.confirm_order_event(uuid, text, timestamptz, text, numeric, numeric, numeric, text, numeric, numeric, numeric, jsonb) to authenticated;
grant execute on function public.apply_mail_event_status(uuid, uuid) to authenticated, service_role;
grant execute on function public.update_order_details(uuid, text, timestamptz, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric) to authenticated;
