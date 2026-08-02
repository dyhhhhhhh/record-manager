alter table public.mail_events
  drop constraint if exists mail_events_merchant_check,
  add constraint mail_events_merchant_check
    check (merchant in ('imusic', 'hmv', 'mutant', 'black_screen', 'laced'));

alter table public.orders
  drop constraint if exists orders_merchant_check,
  add constraint orders_merchant_check
    check (merchant in ('imusic', 'hmv', 'mutant', 'black_screen', 'laced'));
