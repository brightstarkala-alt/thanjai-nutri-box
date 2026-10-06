-- Thanjai Healthy Plate — 0003: admin functions
--
-- NOT EXECUTED AUTOMATICALLY. Review it, then run it once in the Supabase
-- SQL Editor. Runs in one transaction: if anything fails, nothing changes.
--
-- Adds the database functions the admin pages call. No tables, columns or
-- RLS policies are added, changed or removed.
--
-- SECURITY: every function is SECURITY INVOKER — it runs with the signed-in
-- user's own permissions, so the existing RLS policies (all built on
-- is_admin()) remain the only authority over what can be read or changed.
-- Each function also checks is_admin() first, so a non-admin gets a clear
-- "admin access required" error instead of an empty result. They are
-- callable only by signed-in users (not by the public anon role).
--
-- Why functions instead of single-table requests from the browser: several
-- admin actions must change more than one row atomically (approving a
-- payment also confirms the order; copying a week copies its box and add-on
-- settings; saving a date also saves its overrides), and publish
-- validation belongs on the server.

begin;

-- ============================================================
-- Helpers
-- ============================================================
create or replace function admin_assert()
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception using errcode = '42501', message = 'NOT_ADMIN', detail = 'Admin access required.';
  end if;
end;
$$;

-- Admin-facing error: message = machine code, detail = readable text.
create or replace function admin_error(p_code text, p_detail text)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = p_detail;
end;
$$;

create or replace function admin_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

-- ============================================================
-- Orders
-- ============================================================

-- Newest first. p_pending_only: only orders awaiting payment verification.
create or replace function admin_list_orders(p_limit int default 500, p_pending_only boolean default false)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
begin
  perform admin_assert();
  return coalesce((
    select jsonb_agg(r.row_json order by r.placed_at desc)
    from (
      select o.placed_at, jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'placed_at', o.placed_at,
        'plan_type', o.plan_type,
        'order_status', o.order_status,
        'payment_status', o.payment_status,
        'total_amount', o.total_amount,
        'customer_name', coalesce(o.delivery_address_snapshot->>'name', up.full_name),
        'phone', coalesce(up.phone, o.delivery_address_snapshot->>'phone'),
        'delivery_dates', (
          select coalesce(jsonb_agg(distinct i.delivery_date order by i.delivery_date), '[]'::jsonb)
          from order_items i where i.order_id = o.id
        )
      ) as row_json
      from orders o
      left join user_profiles up on up.id = o.customer_id
      where not p_pending_only or o.payment_status = 'payment_verification_pending'
      order by o.placed_at desc
      limit greatest(1, least(coalesce(p_limit, 500), 2000))
    ) r
  ), '[]'::jsonb);
end;
$$;

create or replace function admin_get_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v jsonb;
begin
  perform admin_assert();
  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'placed_at', o.placed_at,
    'plan_type', o.plan_type,
    'order_status', o.order_status,
    'payment_status', o.payment_status,
    'subtotal', o.subtotal,
    'delivery_fee', o.delivery_fee,
    'discount_amount', o.discount_amount,
    'total_amount', o.total_amount,
    'customer_notes', o.customer_notes,
    -- What the customer typed for this order (authoritative for delivery).
    'delivery', o.delivery_address_snapshot,
    -- The customer profile found/created by mobile number.
    'customer', (
      select jsonb_build_object('id', up.id, 'full_name', up.full_name, 'phone', up.phone, 'is_active', up.is_active,
        'order_count', (select count(*) from orders o2 where o2.customer_id = up.id))
      from user_profiles up where up.id = o.customer_id
    ),
    'address', (
      select jsonb_build_object('address_line_1', a.address_line_1, 'address_line_2', a.address_line_2,
        'landmark', a.landmark, 'city', a.city, 'pincode', a.pincode)
      from customer_addresses a where a.id = o.address_id
    ),
    'dates', coalesce((
      select jsonb_agg(d order by d->>'delivery_date')
      from (
        select jsonb_build_object(
          'delivery_date', i.delivery_date,
          'total', sum(i.total_price),
          'items', jsonb_agg(jsonb_build_object(
            'name', i.item_name_snapshot, 'item_type', i.item_type, 'quantity', i.quantity,
            'unit_price', i.unit_price, 'total_price', i.total_price)
            order by i.item_type desc, i.item_name_snapshot)
        ) as d
        from order_items i
        where i.order_id = o.id
        group by i.delivery_date
      ) per_date
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'payment_method', p.payment_method, 'amount', p.amount,
        'transaction_id', p.transaction_id, 'utr_reference', p.utr_reference, 'paid_at', p.paid_at,
        'screenshot_path', p.screenshot_path, 'payment_status', p.payment_status,
        'verified_at', p.verified_at, 'rejection_reason', p.rejection_reason, 'created_at', p.created_at,
        'verified_by_name', (select v.full_name from user_profiles v where v.id = p.verified_by))
        order by p.created_at desc)
      from payments p where p.order_id = o.id
    ), '[]'::jsonb)
  )
  into v
  from orders o
  where o.id = p_order_id;

  if v is null then
    perform admin_error('NOT_FOUND', 'Order not found.');
  end if;
  return v;
end;
$$;

-- Approve or reject a pending payment. Approve: payment approved, order
-- marked paid and (if still pending) confirmed. Reject: payment rejected
-- with a reason, order marked payment-rejected. The verifier is always the
-- signed-in admin (auth.uid()), never a value from the browser.
create or replace function admin_review_payment(p_payment_id uuid, p_decision text, p_reason text default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_payment payments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform admin_assert();
  if p_decision not in ('approve', 'reject') then
    perform admin_error('INVALID_REQUEST', 'Decision must be approve or reject.');
  end if;

  select * into v_payment from payments where id = p_payment_id for update;
  if not found then
    perform admin_error('NOT_FOUND', 'Payment not found.');
  end if;
  if v_payment.payment_status <> 'pending' then
    perform admin_error('ALREADY_REVIEWED', format('This payment was already %s.', v_payment.payment_status));
  end if;

  if p_decision = 'approve' then
    update payments
      set payment_status = 'approved', verified_by = auth.uid(), verified_at = now(), rejection_reason = null
      where id = p_payment_id;
    update orders
      set payment_status = 'paid',
          order_status = case when order_status = 'pending' then 'confirmed' else order_status end
      where id = v_payment.order_id;
  else
    if v_reason is null then
      perform admin_error('REASON_REQUIRED', 'Please give a reason for rejecting this payment.');
    end if;
    update payments
      set payment_status = 'rejected', verified_by = auth.uid(), verified_at = now(), rejection_reason = v_reason
      where id = p_payment_id;
    update orders set payment_status = 'rejected' where id = v_payment.order_id;
  end if;

  return admin_get_order(v_payment.order_id);
end;
$$;

-- Uses the existing order_status values. Preparation/delivery steps need a
-- verified payment; cancelling is always allowed.
create or replace function admin_set_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_payment_status text;
begin
  perform admin_assert();
  if p_status not in ('pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled') then
    perform admin_error('INVALID_REQUEST', 'Unknown order status.');
  end if;
  select payment_status into v_payment_status from orders where id = p_order_id for update;
  if not found then
    perform admin_error('NOT_FOUND', 'Order not found.');
  end if;
  if p_status in ('confirmed', 'preparing', 'out_for_delivery', 'delivered') and v_payment_status <> 'paid' then
    perform admin_error('PAYMENT_NOT_VERIFIED', 'Verify the payment before confirming or delivering this order.');
  end if;
  update orders set order_status = p_status where id = p_order_id;
  return admin_get_order(p_order_id);
end;
$$;

-- ============================================================
-- Dashboard
-- ============================================================
create or replace function admin_dashboard()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_today date := admin_today();
  v_sunday_holiday boolean := coalesce((select sunday_is_holiday from business_settings limit 1), true);
begin
  perform admin_assert();
  return jsonb_build_object(
    'today', v_today,
    'orders_today', (select count(*) from orders where (placed_at at time zone 'Asia/Kolkata')::date = v_today),
    'pending_verification', (select count(*) from orders where payment_status = 'payment_verification_pending' and order_status <> 'cancelled'),
    'upcoming_orders', (
      select count(distinct o.id) from orders o join order_items i on i.order_id = o.id
      where i.delivery_date >= v_today and o.order_status not in ('cancelled', 'delivered')
    ),
    'total_order_value', (select coalesce(sum(total_amount), 0) from orders where order_status <> 'cancelled' and payment_status <> 'rejected'),
    -- Open delivery days from tomorrow on, in published weeks.
    'delivery_dates_configured', (
      select count(*)
      from generate_series(v_today + 1, v_today + 60, interval '1 day') g(d)
      where exists (select 1 from menu_weeks w where w.status = 'published' and g.d::date between w.week_start_date and w.week_end_date)
        and not (extract(dow from g.d) = 0 and v_sunday_holiday)
        and not exists (select 1 from business_holidays h where h.holiday_date = g.d::date)
        and not exists (select 1 from menu_dates m where m.delivery_date = g.d::date and not m.is_service_available)
    ),
    'recent_orders', admin_list_orders(6, false),
    'pending_orders', admin_list_orders(10, true)
  );
end;
$$;

-- ============================================================
-- Menu weeks
-- ============================================================
create or replace function admin_list_weeks()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
begin
  perform admin_assert();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'week_start_date', w.week_start_date, 'week_end_date', w.week_end_date,
      'status', w.status, 'notes', w.notes,
      'order_count', (
        select count(distinct i.order_id) from order_items i
        join orders o on o.id = i.order_id
        where i.delivery_date between w.week_start_date and w.week_end_date and o.order_status <> 'cancelled'
      ))
      order by w.week_start_date desc)
    from menu_weeks w
  ), '[]'::jsonb);
end;
$$;

-- Readiness checks shown before publishing. blocking = can't publish.
create or replace function admin_week_checks(p_week_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_week menu_weeks%rowtype;
  v_checks jsonb := '[]'::jsonb;
  v_box record;
  v_addon record;
  v_open_days int;
  v_sunday_holiday boolean := coalesce((select sunday_is_holiday from business_settings limit 1), true);
begin
  perform admin_assert();
  select * into v_week from menu_weeks where id = p_week_id;
  if not found then
    perform admin_error('NOT_FOUND', 'Week not found.');
  end if;

  for v_box in
    select b.name as box_name, c.id as cfg_id, c.price, c.is_available, c.description
    from box_types b
    left join weekly_box_configurations c on c.box_type_id = b.id and c.menu_week_id = p_week_id
    where b.is_active
    order by b.display_order
  loop
    v_checks := v_checks || jsonb_build_object(
      'label', v_box.box_name || ' configured',
      'ok', v_box.cfg_id is not null and (not v_box.is_available or (v_box.price is not null and coalesce(btrim(v_box.description), '') <> '')),
      'blocking', false,
      'detail', case
        when v_box.cfg_id is null then 'Not set up for this week (customers will see it as unavailable).'
        when not v_box.is_available then 'Marked unavailable this week.'
        when v_box.price is null then 'Available but has no price — customers can''t order it.'
        when coalesce(btrim(v_box.description), '') = '' then 'No description.'
        else format('₹%s · %s', rtrim(to_char(v_box.price, 'FM999990.##'), '.'), v_box.description) end);
  end loop;

  v_checks := v_checks || jsonb_build_object(
    'label', 'At least one box can be ordered',
    'ok', exists (select 1 from weekly_box_configurations c where c.menu_week_id = p_week_id and c.is_available and c.price is not null),
    'blocking', true,
    'detail', 'Customers need at least one available box with a price.');

  for v_addon in
    select a.name as addon_name, c.id as cfg_id, c.price, c.is_available
    from addons a
    left join weekly_addon_configurations c on c.addon_id = a.id and c.menu_week_id = p_week_id
    order by a.name
  loop
    v_checks := v_checks || jsonb_build_object(
      'label', v_addon.addon_name || ' configured',
      'ok', v_addon.cfg_id is not null,
      'blocking', false,
      'detail', case
        when v_addon.cfg_id is null then 'Not set up (won''t be offered this week).'
        when not v_addon.is_available then 'Marked unavailable this week.'
        else format('₹%s', rtrim(to_char(v_addon.price, 'FM999990.##'), '.')) end);
  end loop;

  select count(*) into v_open_days
  from generate_series(v_week.week_start_date, v_week.week_end_date, interval '1 day') g(d)
  where not (extract(dow from g.d) = 0 and v_sunday_holiday)
    and not exists (select 1 from business_holidays h where h.holiday_date = g.d::date)
    and not exists (select 1 from menu_dates m where m.delivery_date = g.d::date and not m.is_service_available);

  v_checks := v_checks || jsonb_build_object(
    'label', 'Delivery dates configured',
    'ok', v_open_days > 0,
    'blocking', true,
    'detail', format('%s delivery day%s open this week.', v_open_days, case when v_open_days = 1 then '' else 's' end));

  return v_checks;
end;
$$;

create or replace function admin_get_week(p_week_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_week menu_weeks%rowtype;
  v_settings business_settings%rowtype;
begin
  perform admin_assert();
  select * into v_week from menu_weeks where id = p_week_id;
  if not found then
    perform admin_error('NOT_FOUND', 'Week not found.');
  end if;
  select * into v_settings from business_settings limit 1;

  return jsonb_build_object(
    'week', jsonb_build_object('id', v_week.id, 'week_start_date', v_week.week_start_date, 'week_end_date', v_week.week_end_date,
      'status', v_week.status, 'notes', v_week.notes),
    'settings', jsonb_build_object('default_cutoff_time', v_settings.default_cutoff_time, 'sunday_is_holiday', v_settings.sunday_is_holiday),
    'boxes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'box_type_id', b.id, 'code', b.code, 'box_name', b.name,
        'config', case when c.id is null then null else jsonb_build_object(
          'name', c.name, 'description', c.description, 'contents', c.contents,
          'price', c.price, 'is_available', c.is_available) end)
        order by b.display_order)
      from box_types b
      left join weekly_box_configurations c on c.box_type_id = b.id and c.menu_week_id = p_week_id
      where b.is_active
    ), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'addon_id', a.id, 'code', a.code, 'addon_name', a.name,
        'config', case when c.id is null then null else jsonb_build_object('price', c.price, 'is_available', c.is_available) end)
        order by a.name)
      from addons a
      left join weekly_addon_configurations c on c.addon_id = a.id and c.menu_week_id = p_week_id
    ), '[]'::jsonb),
    'dates', (
      select jsonb_agg(jsonb_build_object(
        'date', g.d::date,
        'is_sunday', extract(dow from g.d) = 0,
        'business_holiday', (select coalesce(h.reason, 'Holiday') from business_holidays h where h.holiday_date = g.d::date),
        'menu_date', (select jsonb_build_object('id', m.id, 'is_service_available', m.is_service_available,
                        'holiday_reason', m.holiday_reason, 'cutoff_time', m.cutoff_time)
                      from menu_dates m where m.delivery_date = g.d::date),
        'order_count', (select count(distinct i.order_id) from order_items i join orders o on o.id = i.order_id
                        where i.delivery_date = g.d::date and o.order_status <> 'cancelled'),
        'box_overrides', coalesce((
          select jsonb_agg(jsonb_build_object('box_type_id', dbc.box_type_id, 'name', dbc.name, 'description', dbc.description,
                   'contents', dbc.contents, 'price', dbc.price, 'is_available', dbc.is_available))
          from date_box_configurations dbc join menu_dates m on m.id = dbc.menu_date_id
          where m.delivery_date = g.d::date), '[]'::jsonb),
        'addon_overrides', coalesce((
          select jsonb_agg(jsonb_build_object('addon_id', dac.addon_id, 'price', dac.price, 'is_available', dac.is_available))
          from date_addon_configurations dac join menu_dates m on m.id = dac.menu_date_id
          where m.delivery_date = g.d::date), '[]'::jsonb))
        order by g.d)
      from generate_series(v_week.week_start_date, v_week.week_start_date + 6, interval '1 day') g(d)
    ),
    'checks', admin_week_checks(p_week_id)
  );
end;
$$;

-- New week starting p_start (a Monday), Monday–Saturday, as a draft.
-- With p_copy_from: copies that week's box and add-on settings (not its
-- date-specific settings).
create or replace function admin_create_week(p_start date, p_copy_from uuid default null, p_notes text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform admin_assert();
  if p_start is null or extract(dow from p_start) <> 1 then
    perform admin_error('INVALID_REQUEST', 'A week must start on a Monday.');
  end if;
  if exists (select 1 from menu_weeks where week_start_date = p_start) then
    perform admin_error('WEEK_EXISTS', 'A menu for that week already exists.');
  end if;

  insert into menu_weeks (week_start_date, week_end_date, status, notes)
  values (p_start, p_start + 5, 'draft', nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  if p_copy_from is not null then
    insert into weekly_box_configurations (menu_week_id, box_type_id, name, description, contents, price, is_available, image_url)
    select v_id, box_type_id, name, description, contents, price, is_available, image_url
    from weekly_box_configurations where menu_week_id = p_copy_from;
    insert into weekly_addon_configurations (menu_week_id, addon_id, price, is_available)
    select v_id, addon_id, price, is_available
    from weekly_addon_configurations where menu_week_id = p_copy_from;
  end if;
  return v_id;
end;
$$;

/*
  p shape:
  { "notes": "...",
    "boxes":  [ { "box_type_id": uuid, "name": "...", "description": "...", "contents": ["..."],
                  "price": 69 | null, "is_available": true } ],
    "addons": [ { "addon_id": uuid, "price": 30, "is_available": true } ] }
*/
create or replace function admin_save_week(p_week_id uuid, p jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_item jsonb;
  v_price numeric;
  v_available boolean;
begin
  perform admin_assert();
  if not exists (select 1 from menu_weeks where id = p_week_id) then
    perform admin_error('NOT_FOUND', 'Week not found.');
  end if;

  if p ? 'notes' then
    update menu_weeks set notes = nullif(btrim(coalesce(p->>'notes', '')), '') where id = p_week_id;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p->'boxes', '[]'::jsonb))
  loop
    v_price := nullif(v_item->>'price', '')::numeric;
    v_available := coalesce((v_item->>'is_available')::boolean, false);
    if v_price is not null and v_price < 0 then
      perform admin_error('INVALID_PRICE', 'Prices can''t be negative.');
    end if;
    if v_available and v_price is null then
      perform admin_error('INVALID_PRICE', 'An available box needs a price.');
    end if;
    insert into weekly_box_configurations (menu_week_id, box_type_id, name, description, contents, price, is_available)
    values (p_week_id, (v_item->>'box_type_id')::uuid,
            nullif(btrim(coalesce(v_item->>'name', '')), ''),
            nullif(btrim(coalesce(v_item->>'description', '')), ''),
            coalesce(v_item->'contents', '[]'::jsonb), v_price, v_available)
    on conflict (menu_week_id, box_type_id) do update set
      name = excluded.name, description = excluded.description, contents = excluded.contents,
      price = excluded.price, is_available = excluded.is_available;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p->'addons', '[]'::jsonb))
  loop
    v_price := nullif(v_item->>'price', '')::numeric;
    if v_price is null or v_price < 0 then
      perform admin_error('INVALID_PRICE', 'Add-ons need a price (0 or more).');
    end if;
    insert into weekly_addon_configurations (menu_week_id, addon_id, price, is_available)
    values (p_week_id, (v_item->>'addon_id')::uuid, v_price, coalesce((v_item->>'is_available')::boolean, false))
    on conflict (menu_week_id, addon_id) do update set
      price = excluded.price, is_available = excluded.is_available;
  end loop;

  return admin_get_week(p_week_id);
end;
$$;

-- draft → customers can't see it; published → customers can order;
-- closed → no new orders (place_customer_order only accepts published).
create or replace function admin_set_week_status(p_week_id uuid, p_status text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_blocking text;
begin
  perform admin_assert();
  if p_status not in ('draft', 'published', 'closed') then
    perform admin_error('INVALID_REQUEST', 'Unknown week status.');
  end if;
  if not exists (select 1 from menu_weeks where id = p_week_id) then
    perform admin_error('NOT_FOUND', 'Week not found.');
  end if;
  if p_status = 'published' then
    select string_agg(c->>'label', ', ') into v_blocking
    from jsonb_array_elements(admin_week_checks(p_week_id)) c
    where (c->>'blocking')::boolean and not (c->>'ok')::boolean;
    if v_blocking is not null then
      perform admin_error('WEEK_NOT_READY', 'Can''t publish yet: ' || v_blocking || '.');
    end if;
  end if;
  update menu_weeks set status = p_status where id = p_week_id;
  return admin_get_week(p_week_id);
end;
$$;

/*
  Delivery-date settings + date-specific overrides for one date of a week.
  p shape:
  { "is_service_available": true, "holiday_reason": "...", "cutoff_time": "21:00" | null,
    "box_overrides":   [ { "box_type_id": uuid, "enabled": true, "name": "...", "description": "...",
                           "contents": ["..."], "price": 79, "is_available": true } ],
    "addon_overrides": [ { "addon_id": uuid, "enabled": true, "price": 35, "is_available": true } ] }
  An override replaces the week's setting for that date only; enabled=false
  removes it (the date goes back to the weekly setting).
*/
create or replace function admin_save_date(p_week_id uuid, p_date date, p jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_week menu_weeks%rowtype;
  v_menu_date_id uuid;
  v_item jsonb;
  v_price numeric;
  v_available boolean;
  v_cutoff time;
begin
  perform admin_assert();
  select * into v_week from menu_weeks where id = p_week_id;
  if not found then
    perform admin_error('NOT_FOUND', 'Week not found.');
  end if;
  if p_date < v_week.week_start_date or p_date > v_week.week_end_date then
    perform admin_error('INVALID_REQUEST', 'That date is not part of this week.');
  end if;
  if extract(dow from p_date) = 0 then
    perform admin_error('INVALID_REQUEST', 'Sunday is never a delivery day.');
  end if;
  if exists (select 1 from menu_dates where delivery_date = p_date and menu_week_id <> p_week_id) then
    perform admin_error('INVALID_REQUEST', 'That date belongs to a different week.');
  end if;
  begin
    v_cutoff := nullif(p->>'cutoff_time', '')::time;
  exception when others then
    perform admin_error('INVALID_REQUEST', 'Cutoff time must look like 21:00.');
  end;

  insert into menu_dates (menu_week_id, delivery_date, is_service_available, holiday_reason, cutoff_time)
  values (p_week_id, p_date, coalesce((p->>'is_service_available')::boolean, true),
          nullif(btrim(coalesce(p->>'holiday_reason', '')), ''), v_cutoff)
  on conflict (delivery_date) do update set
    is_service_available = excluded.is_service_available,
    holiday_reason = excluded.holiday_reason,
    cutoff_time = excluded.cutoff_time
  returning id into v_menu_date_id;

  for v_item in select value from jsonb_array_elements(coalesce(p->'box_overrides', '[]'::jsonb))
  loop
    if coalesce((v_item->>'enabled')::boolean, false) then
      v_price := nullif(v_item->>'price', '')::numeric;
      v_available := coalesce((v_item->>'is_available')::boolean, false);
      if v_price is not null and v_price < 0 then
        perform admin_error('INVALID_PRICE', 'Prices can''t be negative.');
      end if;
      if v_available and v_price is null then
        perform admin_error('INVALID_PRICE', 'An available box needs a price.');
      end if;
      insert into date_box_configurations (menu_date_id, box_type_id, name, description, contents, price, is_available)
      values (v_menu_date_id, (v_item->>'box_type_id')::uuid,
              nullif(btrim(coalesce(v_item->>'name', '')), ''),
              nullif(btrim(coalesce(v_item->>'description', '')), ''),
              v_item->'contents', v_price, v_available)
      on conflict (menu_date_id, box_type_id) do update set
        name = excluded.name, description = excluded.description, contents = excluded.contents,
        price = excluded.price, is_available = excluded.is_available;
    else
      delete from date_box_configurations
      where menu_date_id = v_menu_date_id and box_type_id = (v_item->>'box_type_id')::uuid;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p->'addon_overrides', '[]'::jsonb))
  loop
    if coalesce((v_item->>'enabled')::boolean, false) then
      v_price := nullif(v_item->>'price', '')::numeric;
      if v_price is null or v_price < 0 then
        perform admin_error('INVALID_PRICE', 'Add-on overrides need a price (0 or more).');
      end if;
      insert into date_addon_configurations (menu_date_id, addon_id, price, is_available)
      values (v_menu_date_id, (v_item->>'addon_id')::uuid, v_price, coalesce((v_item->>'is_available')::boolean, false))
      on conflict (menu_date_id, addon_id) do update set
        price = excluded.price, is_available = excluded.is_available;
    else
      delete from date_addon_configurations
      where menu_date_id = v_menu_date_id and addon_id = (v_item->>'addon_id')::uuid;
    end if;
  end loop;

  return admin_get_week(p_week_id);
end;
$$;

-- ============================================================
-- Permissions: signed-in users only (each function then requires an admin)
-- ============================================================
do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_list_orders(integer, boolean)', 'admin_get_order(uuid)', 'admin_review_payment(uuid, text, text)',
    'admin_set_order_status(uuid, text)', 'admin_dashboard()', 'admin_list_weeks()', 'admin_week_checks(uuid)',
    'admin_get_week(uuid)', 'admin_create_week(date, uuid, text)', 'admin_save_week(uuid, jsonb)',
    'admin_set_week_status(uuid, text)', 'admin_save_date(uuid, date, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['admin_assert()', 'admin_error(text, text)', 'admin_today()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;
