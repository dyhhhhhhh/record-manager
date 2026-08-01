begin;

select plan(8);

select has_table('public', 'orders', 'orders table exists');
select has_table('public', 'order_items', 'order_items table exists');
select has_table('public', 'mail_events', 'mail_events table exists');
select row_security_active('public.orders'::regclass, 'orders has RLS enabled');
select row_security_active('public.order_items'::regclass, 'order_items has RLS enabled');
select row_security_active('public.mail_events'::regclass, 'mail_events has RLS enabled');
select has_function('public', 'try_start_mail_sync', array['uuid'], 'sync lock function exists');
select has_check('public', 'orders', 'orders validates business data');

select * from finish();
rollback;
