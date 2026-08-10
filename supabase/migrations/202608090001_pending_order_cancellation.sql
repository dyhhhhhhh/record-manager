alter table public.mail_events
  add column if not exists manually_cancelled_at timestamptz;

create or replace function public.set_pending_order_cancellation(
  p_event_id uuid,
  p_merchant text,
  p_external_order_id text,
  p_cancelled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  event_row public.mail_events%rowtype;
begin
  if owner_id is null or not public.is_app_owner() then
    raise exception 'not allowed';
  end if;

  if p_cancelled is null then
    raise exception 'cancellation state is required';
  end if;

  select * into event_row
  from public.mail_events
  where id = p_event_id
    and user_id = owner_id
    and merchant = p_merchant
    and external_order_id = p_external_order_id
    and event_type = 'order_confirmation'
    and status = 'pending'
    and related_order_id is null
  for update;

  if not found then
    raise exception 'pending order event not found';
  end if;

  if not p_cancelled and exists (
    select 1
    from public.mail_events cancellation
    where cancellation.user_id = owner_id
      and cancellation.merchant = event_row.merchant
      and cancellation.external_order_id = event_row.external_order_id
      and cancellation.event_type = 'cancellation'
      and (
        cancellation.status = 'applied'
        or (cancellation.status = 'pending' and cancellation.authentication_verified)
      )
  ) then
    raise exception 'mail cancellation cannot be restored';
  end if;

  update public.mail_events
  set manually_cancelled_at = case
    when p_cancelled then coalesce(manually_cancelled_at, now())
    else null
  end
  where id = event_row.id;
end;
$$;

create or replace function public.prevent_manually_cancelled_order_import()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.event_type = 'order_confirmation'
    and old.manually_cancelled_at is not null
    and new.status = 'applied'
    and new.related_order_id is not null then
    raise exception 'manually cancelled orders cannot be imported';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_manually_cancelled_order_import on public.mail_events;
create trigger prevent_manually_cancelled_order_import
before update of status, related_order_id on public.mail_events
for each row execute function public.prevent_manually_cancelled_order_import();

revoke all on function public.set_pending_order_cancellation(uuid, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_pending_order_cancellation(uuid, text, text, boolean)
  to authenticated;
revoke all on function public.prevent_manually_cancelled_order_import()
  from public, anon, authenticated, service_role;
