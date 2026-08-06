begin;

select plan(14);

insert into auth.users(id, email)
values ('11000000-0000-0000-0000-000000000001', 'cdjapan-coverage@example.com');

insert into public.app_owner(user_id, email)
values ('11000000-0000-0000-0000-000000000001', 'cdjapan-coverage@example.com');

insert into public.mail_events(
  id, user_id, mailbox, message_id, imap_uid, uid_validity, sender, merchant,
  subject, received_at, event_type, status, external_order_id, parsed_payload,
  authentication_verified
) values (
  '21000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  'owner@qq.com', '<cdjapan-confirmation-1@test>', 1, 1, 'order@cdjapan.co.jp', 'cdjapan',
  'Order Confirmation #73000001', now(), 'order_confirmation', 'pending', '73000001', '{}', false
), (
  '21000000-0000-0000-0000-000000000002',
  '11000000-0000-0000-0000-000000000001',
  'owner@qq.com', '<cdjapan-confirmation-2@test>', 2, 1, 'order@cdjapan.co.jp', 'cdjapan',
  'Order Confirmation #73000002', now(), 'order_confirmation', 'pending', '73000002', '{}', false
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$
    select public.confirm_order_event(
      '21000000-0000-0000-0000-000000000001',
      '73000001', now(), 'JPY', 5000, 1200, 100, 'EMS', 300, 0, 6000,
      '[
        {"id":"31000000-0000-0000-0000-000000000001","merchantItemId":"SYNTH-001","albumTitle":"Album One","artistName":"Artist One","unitPrice":"1500","quantity":2},
        {"id":"31000000-0000-0000-0000-000000000002","merchantItemId":"SYNTH-002","albumTitle":"Album Two","artistName":"Unknown","unitPrice":"2000","quantity":1}
      ]'
    )
  $$,
  'CDJapan confirmation imports every catalog item and additional fee'
);

select is(
  (select additional_fee_total from public.orders where external_order_id = '73000001'),
  100::numeric,
  'additional fee is stored independently'
);

select is(
  (select array_agg(merchant_item_id order by merchant_item_id) from public.order_items
   where order_id = (select id from public.orders where external_order_id = '73000001')),
  array['SYNTH-001', 'SYNTH-002']::text[],
  'catalog numbers are stored on order items'
);

insert into public.mail_events(
  id, user_id, mailbox, message_id, imap_uid, uid_validity, sender, merchant,
  subject, received_at, event_type, status, external_order_id, parsed_payload,
  authentication_verified
) values (
  '21000000-0000-0000-0000-000000000011',
  '11000000-0000-0000-0000-000000000001',
  'owner@qq.com', '<cdjapan-package-a@test>', 11, 1, 'order@cdjapan.co.jp', 'cdjapan',
  'Order Update: We Shipped Your Order Today', now(), 'shipment', 'pending', '73000001',
  '{"packageKey":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","shipmentItems":[{"merchantItemId":"SYNTH-001","quantity":1}]}', true
), (
  '21000000-0000-0000-0000-000000000012',
  '11000000-0000-0000-0000-000000000001',
  'owner@qq.com', '<cdjapan-package-a-duplicate@test>', 12, 1, 'order@cdjapan.co.jp', 'cdjapan',
  'Order Update: We Shipped Your Order Today', now() + interval '1 minute', 'shipment', 'pending', '73000001',
  '{"packageKey":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","shipmentItems":[{"merchantItemId":"SYNTH-001","quantity":9}]}', true
), (
  '21000000-0000-0000-0000-000000000013',
  '11000000-0000-0000-0000-000000000001',
  'owner@qq.com', '<cdjapan-package-b@test>', 13, 1, 'order@cdjapan.co.jp', 'cdjapan',
  'Order Update: We Shipped Your Order Today', now() + interval '2 minutes', 'shipment', 'pending', '73000001',
  '{"packageKey":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","shipmentItems":[{"merchantItemId":"SYNTH-002","quantity":1}]}', true
), (
  '21000000-0000-0000-0000-000000000014',
  '11000000-0000-0000-0000-000000000001',
  'owner@qq.com', '<cdjapan-package-c@test>', 14, 1, 'order@cdjapan.co.jp', 'cdjapan',
  'Order Update: We Shipped Your Order Today', now() + interval '3 minutes', 'shipment', 'pending', '73000001',
  '{"packageKey":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","shipmentItems":[{"merchantItemId":"SYNTH-001","quantity":1}]}', true
);

select lives_ok(
  $$ select public.apply_mail_event_status(
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000011'
  ) $$,
  'first trusted package is applied'
);

select is(
  (select fulfillment_status from public.orders where external_order_id = '73000001'),
  'ordered'::public.fulfillment_status,
  'one partial package does not mark the whole order shipped'
);

select lives_ok(
  $$ select public.apply_mail_event_status(
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000012'
  ) $$,
  'duplicate trusted package notification is applied to the timeline'
);

select is(
  (select fulfillment_status from public.orders where external_order_id = '73000001'),
  'ordered'::public.fulfillment_status,
  'duplicate package key is not counted twice'
);

select lives_ok(
  $$ select public.apply_mail_event_status(
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000013'
  ) $$,
  'second distinct trusted package is applied'
);

select is(
  (select fulfillment_status from public.orders where external_order_id = '73000001'),
  'ordered'::public.fulfillment_status,
  'a product remains unshipped until its full ordered quantity is covered'
);

select lives_ok(
  $$ select public.apply_mail_event_status(
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000014'
  ) $$,
  'a third distinct trusted package is applied'
);

select is(
  (select fulfillment_status from public.orders where external_order_id = '73000001'),
  'shipped'::public.fulfillment_status,
  'distinct packages cumulatively covering every ordered quantity mark the order shipped'
);

select lives_ok(
  $$
    select public.confirm_order_event(
      '21000000-0000-0000-0000-000000000002',
      '73000002', now(), 'JPY', 5000, 1200, 0, 'EMS', 0, 0, 6200,
      '[
        {"id":"31000000-0000-0000-0000-000000000011","merchantItemId":"SYNTH-011","albumTitle":"Album Eleven","artistName":"Artist","unitPrice":"3000","quantity":1},
        {"id":"31000000-0000-0000-0000-000000000012","merchantItemId":"SYNTH-012","albumTitle":"Album Twelve","artistName":"Artist","unitPrice":"2000","quantity":1}
      ]'
    )
  $$,
  'second CDJapan confirmation is imported'
);

insert into public.mail_events(
  id, user_id, mailbox, message_id, imap_uid, uid_validity, sender, merchant,
  subject, received_at, event_type, status, external_order_id, parsed_payload,
  authentication_verified
) values (
  '21000000-0000-0000-0000-000000000021',
  '11000000-0000-0000-0000-000000000001',
  'owner@qq.com', '<cdjapan-unkeyed-partial@test>', 21, 1, 'order@cdjapan.co.jp', 'cdjapan',
  'Order Update: We Shipped Your Order Today', now(), 'shipment', 'pending', '73000002',
  '{"shipmentItems":[{"merchantItemId":"SYNTH-011","quantity":1}]}', true
), (
  '21000000-0000-0000-0000-000000000022',
  '11000000-0000-0000-0000-000000000001',
  'owner@qq.com', '<cdjapan-unkeyed-full@test>', 22, 1, 'order@cdjapan.co.jp', 'cdjapan',
  'Order Update: We Shipped Your Order Today', now() + interval '1 minute', 'shipment', 'pending', '73000002',
  '{"shipmentItems":[{"merchantItemId":"SYNTH-011","quantity":1},{"merchantItemId":"SYNTH-012","quantity":1}]}', true
);

select public.apply_mail_event_status(
  '11000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000021'
);

select is(
  (select fulfillment_status from public.orders where external_order_id = '73000002'),
  'ordered'::public.fulfillment_status,
  'unkeyed partial shipment stays in the timeline without changing status'
);

select public.apply_mail_event_status(
  '11000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000022'
);

select is(
  (select fulfillment_status from public.orders where external_order_id = '73000002'),
  'shipped'::public.fulfillment_status,
  'one unkeyed event covering the full order may mark it shipped'
);

select * from finish();
rollback;
