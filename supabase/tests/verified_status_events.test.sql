begin;

select plan(7);

insert into auth.users(id, email)
values ('10000000-0000-0000-0000-000000000001', 'verified-status@example.com');

insert into public.app_owner(user_id, email)
values ('10000000-0000-0000-0000-000000000001', 'verified-status@example.com');

insert into public.mail_events(
  id, user_id, mailbox, message_id, imap_uid, uid_validity, sender, merchant,
  subject, received_at, event_type, status, external_order_id, parsed_payload,
  authentication_verified
) values
(
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'owner@qq.com', '<confirmation@test>', 1, 1, 'order@imusic.dk', 'imusic',
  'Order Acknowledgment', now(), 'order_confirmation', 'pending', '90000001', '{}', false
),
(
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'owner@qq.com', '<shipment@test>', 2, 1, 'order@imusic.dk', 'imusic',
  'Dispatched', now(), 'shipment', 'pending', '90000001', '{}', false
),
(
  '20000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'owner@qq.com', '<cancellation@test>', 3, 1, 'order@imusic.dk', 'imusic',
  'Cancelled', now(), 'cancellation', 'pending', '90000001', '{}', false
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$
    select public.confirm_order_event(
      '20000000-0000-0000-0000-000000000001',
      '90000001', now(), 'CNY', 100, 20, 0, 'Tracked', 0, 0, 120,
      '[{"id":"30000000-0000-0000-0000-000000000001","albumTitle":"Album","artistName":"Artist","unitPrice":"100","quantity":1}]'
    )
  $$,
  'unverified cancellation does not block import'
);

select is(
  (select fulfillment_status from public.orders where external_order_id = '90000001'),
  'ordered'::public.fulfillment_status,
  'unverified shipment does not set the initial fulfillment state'
);

select is(
  (select count(*)::integer from public.mail_events where event_type in ('shipment', 'cancellation') and status = 'pending'),
  2,
  'unverified status events remain pending after import'
);

select is(
  (select status from public.mail_events where id = '20000000-0000-0000-0000-000000000001'),
  'applied'::public.mail_event_status,
  'confirmation event is applied during import'
);

select throws_ok(
  $$ select public.apply_mail_event_status(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002'
  ) $$,
  'P0001',
  'unverified status event',
  'unverified shipment cannot be applied automatically'
);

update public.mail_events
set authentication_verified = true
where id = '20000000-0000-0000-0000-000000000002';

select lives_ok(
  $$ select public.apply_mail_event_status(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002'
  ) $$,
  'verified shipment can be applied automatically'
);

select is(
  (select fulfillment_status from public.orders where external_order_id = '90000001'),
  'shipped'::public.fulfillment_status,
  'verified shipment advances the order to shipped'
);

select * from finish();
rollback;
