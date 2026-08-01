create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.fulfillment_status as enum ('ordered', 'shipped', 'received');
create type public.mail_event_type as enum ('order_confirmation', 'shipment', 'cancellation');
create type public.mail_event_status as enum ('pending', 'applied', 'ignored', 'failed');
create type public.mail_sync_status as enum ('running', 'succeeded', 'failed');

create table public.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email extensions.citext not null unique,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null default 'imusic' check (merchant = 'imusic'),
  external_order_id text not null check (length(trim(external_order_id)) > 0),
  ordered_at timestamptz not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  original_total numeric(14, 2) not null check (original_total >= 0),
  effective_total numeric(14, 2) not null check (effective_total >= 0),
  fulfillment_status public.fulfillment_status not null default 'ordered',
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant, external_order_id)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  album_title text not null check (length(trim(album_title)) > 0),
  artist_name text not null check (length(trim(artist_name)) > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  source_image_url text,
  image_path text,
  product_url text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mail_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox text not null,
  message_id text,
  imap_uid bigint not null check (imap_uid > 0),
  uid_validity bigint not null check (uid_validity > 0),
  sender text not null,
  subject text not null,
  received_at timestamptz not null,
  event_type public.mail_event_type not null,
  status public.mail_event_status not null default 'pending',
  external_order_id text,
  parsed_payload jsonb not null default '{}'::jsonb,
  parse_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(parse_errors) = 'array'),
  related_order_id uuid references public.orders(id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mailbox, uid_validity, imap_uid)
);

create unique index mail_events_unique_message_id
  on public.mail_events(user_id, mailbox, message_id)
  where message_id is not null;

create table public.mail_sync_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox text not null,
  initial_scan_from date not null,
  uid_validity bigint,
  last_seen_uid bigint not null default 0 check (last_seen_uid >= 0),
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (user_id, mailbox)
);

create table public.mail_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.mail_sync_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  scanned_count integer not null default 0 check (scanned_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_summary text
);

create unique index one_running_mail_sync_per_owner
  on public.mail_sync_runs(user_id)
  where status = 'running';

create index orders_user_date_idx on public.orders(user_id, ordered_at desc);
create index orders_external_id_idx on public.orders(user_id, external_order_id);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_search_idx on public.order_items(lower(album_title), lower(artist_name));
create index mail_events_pending_idx on public.mail_events(user_id, status, received_at desc);

create or replace function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_owner owner_row where owner_row.user_id = auth.uid()
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

create trigger order_items_touch_updated_at
before update on public.order_items
for each row execute function public.touch_updated_at();

create trigger mail_events_touch_updated_at
before update on public.mail_events
for each row execute function public.touch_updated_at();

create trigger mail_sync_state_touch_updated_at
before update on public.mail_sync_state
for each row execute function public.touch_updated_at();

create or replace function public.try_start_mail_sync(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id uuid;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'not allowed';
  end if;

  insert into public.mail_sync_runs(user_id)
  values (p_user_id)
  returning id into run_id;

  return run_id;
exception
  when unique_violation then return null;
end;
$$;

create or replace function public.finish_mail_sync(
  p_run_id uuid,
  p_status public.mail_sync_status,
  p_scanned_count integer,
  p_matched_count integer,
  p_failed_count integer,
  p_error_summary text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status = 'running' then
    raise exception 'a completed run cannot remain running';
  end if;

  update public.mail_sync_runs
  set status = p_status,
      finished_at = now(),
      scanned_count = p_scanned_count,
      matched_count = p_matched_count,
      failed_count = p_failed_count,
      error_summary = p_error_summary
  where id = p_run_id
    and (auth.role() = 'service_role' or user_id = auth.uid());

  if not found then
    raise exception 'sync run not found';
  end if;
end;
$$;

revoke all on function public.try_start_mail_sync(uuid) from public;
revoke all on function public.finish_mail_sync(uuid, public.mail_sync_status, integer, integer, integer, text) from public;
grant execute on function public.try_start_mail_sync(uuid) to authenticated, service_role;
grant execute on function public.finish_mail_sync(uuid, public.mail_sync_status, integer, integer, integer, text) to authenticated, service_role;

alter table public.app_owner enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.mail_events enable row level security;
alter table public.mail_sync_state enable row level security;
alter table public.mail_sync_runs enable row level security;

create policy "owner can read owner binding"
on public.app_owner for select
to authenticated
using (user_id = auth.uid());

create policy "owner manages orders"
on public.orders for all
to authenticated
using (public.is_app_owner() and user_id = auth.uid())
with check (public.is_app_owner() and user_id = auth.uid());

create policy "owner manages order items"
on public.order_items for all
to authenticated
using (
  public.is_app_owner() and exists (
    select 1 from public.orders parent_order
    where parent_order.id = order_id and parent_order.user_id = auth.uid()
  )
)
with check (
  public.is_app_owner() and exists (
    select 1 from public.orders parent_order
    where parent_order.id = order_id and parent_order.user_id = auth.uid()
  )
);

create policy "owner manages mail events"
on public.mail_events for all
to authenticated
using (public.is_app_owner() and user_id = auth.uid())
with check (public.is_app_owner() and user_id = auth.uid());

create policy "owner manages mail sync state"
on public.mail_sync_state for all
to authenticated
using (public.is_app_owner() and user_id = auth.uid())
with check (public.is_app_owner() and user_id = auth.uid());

create policy "owner reads mail sync runs"
on public.mail_sync_runs for select
to authenticated
using (public.is_app_owner() and user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('album-covers', 'album-covers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "owner reads album covers"
on storage.objects for select
to authenticated
using (
  bucket_id = 'album-covers'
  and public.is_app_owner()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner writes album covers"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'album-covers'
  and public.is_app_owner()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner updates album covers"
on storage.objects for update
to authenticated
using (
  bucket_id = 'album-covers'
  and public.is_app_owner()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'album-covers'
  and public.is_app_owner()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner deletes album covers"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'album-covers'
  and public.is_app_owner()
  and (storage.foldername(name))[1] = auth.uid()::text
);
