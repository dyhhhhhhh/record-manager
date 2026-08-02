begin;

select plan(22);

select has_table('public', 'orders', 'orders table exists');
select has_table('public', 'order_items', 'order_items table exists');
select has_table('public', 'mail_events', 'mail_events table exists');
select row_security_active('public.orders'::regclass, 'orders has RLS enabled');
select row_security_active('public.order_items'::regclass, 'order_items has RLS enabled');
select row_security_active('public.mail_events'::regclass, 'mail_events has RLS enabled');
select has_function('public', 'try_start_mail_sync', array['uuid'], 'sync lock function exists');
select has_check('public', 'orders', 'orders validates business data');
select has_column('public', 'orders', 'items_subtotal', 'orders stores the item subtotal');
select has_column('public', 'orders', 'shipping_total', 'orders stores shipping cost');
select has_column('public', 'orders', 'shipping_method', 'orders stores shipping method');
select has_column('public', 'orders', 'tax_total', 'orders stores included tax');
select has_column('public', 'orders', 'discount_total', 'orders stores discounts');
select has_column('public', 'mail_events', 'merchant', 'mail events identify their merchant');
select has_column('public', 'mail_events', 'authentication_verified', 'mail events store sender authentication');
select col_not_null('public', 'mail_events', 'authentication_verified', 'sender authentication cannot be null');
select col_default_is('public', 'mail_events', 'authentication_verified', 'false', 'sender authentication defaults to false');
select has_function(
  'public',
  'confirm_order_event',
  array['uuid', 'text', 'timestamp with time zone', 'text', 'numeric', 'numeric', 'text', 'numeric', 'numeric', 'numeric', 'jsonb'],
  'order import function stores the fee breakdown'
);
select has_function('public', 'apply_mail_event_status', array['uuid', 'uuid'], 'automatic mail status function exists');
select has_function(
  'public',
  'update_order_details',
  array['uuid', 'text', 'timestamp with time zone', 'text', 'numeric', 'numeric', 'text', 'numeric', 'numeric', 'numeric', 'numeric'],
  'order detail updates keep grouped mail aligned'
);
select matches(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'public.orders'::regclass and conname = 'orders_merchant_check'),
  'mutant.*black_screen.*laced',
  'orders accepts all supported merchant keys'
);
select matches(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'public.mail_events'::regclass and conname = 'mail_events_merchant_check'),
  'mutant.*black_screen.*laced',
  'mail events accept all supported merchant keys'
);

select * from finish();
rollback;
