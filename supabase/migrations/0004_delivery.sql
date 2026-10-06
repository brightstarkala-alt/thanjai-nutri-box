-- Thanjai Healthy Plate — 0004: delivery location + delivery status
--
-- NOT EXECUTED AUTOMATICALLY. Review it, then run it once in the Supabase
-- SQL Editor (after 0002 and 0003). One transaction: if anything fails,
-- nothing changes.
--
-- What this changes (nothing is dropped; no RLS policy is added or changed):
--   1. customer_addresses: optional latitude/longitude (the delivery pin).
--   2. orders: delivered_at — set by the database clock when an admin marks
--      the order delivered.
--   3. place_customer_order: accepts an optional map pin, stores it on the
--      order's delivery snapshot (and on a new/unpinned saved address).
--      Everything else in checkout is unchanged.
--   4. admin_get_order: also returns delivered_at and the address pin.
--   5. admin_set_order_status: enforces the delivery steps
--        pending → confirmed → preparing → out_for_delivery → delivered
--      (each step needs a verified payment; cancel allowed until delivered)
--      and records delivered_at.
--
-- Location data stays private: orders and customer_addresses are readable
-- only by admins (existing RLS), and customers have no direct write access.

begin;

-- ============================================================
-- 1–2. Columns
-- ============================================================
alter table customer_addresses add column latitude numeric(9, 6);
alter table customer_addresses add column longitude numeric(9, 6);
alter table customer_addresses add constraint customer_addresses_location_valid check (
  (latitude is null and longitude is null)
  or (latitude between -90 and 90 and longitude between -180 and 180)
);

alter table orders add column delivered_at timestamptz;

-- ============================================================
-- 3. Checkout: optional delivery pin (rest of the function unchanged from 0002)
-- ============================================================
create or replace function place_customer_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_existing uuid;
  v_plan text := p_order->>'plan_type';
  v_name text := btrim(coalesce(p_order#>>'{customer,name}', ''));
  v_digits text := regexp_replace(coalesce(p_order#>>'{customer,mobile}', ''), '\D', '', 'g');
  v_phone text;
  v_address text := btrim(coalesce(p_order#>>'{customer,address}', ''));
  v_landmark text := nullif(btrim(coalesce(p_order#>>'{customer,instructions}', '')), '');
  -- Optional exact delivery pin chosen on the map (delivery use only).
  v_lat numeric;
  v_lng numeric;
  v_customer_id uuid;
  v_customer_active boolean;
  v_address_id uuid;
  v_dates jsonb := p_order->'dates';
  v_pay jsonb := coalesce(p_order->'payment', '{}'::jsonb);
  v_utr text := nullif(regexp_replace(coalesce(v_pay->>'utr', ''), '\s', '', 'g'), '');
  v_txn text := nullif(btrim(coalesce(v_pay->>'transaction_id', '')), '');
  v_ext text := lower(coalesce(v_pay->>'screenshot_ext', ''));
  v_paid_at timestamptz;
  v_amount numeric;
  v_settings business_settings%rowtype;
  v_now_local timestamp := now() at time zone 'Asia/Kolkata';
  v_entry jsonb;
  v_date date;
  v_label text;
  v_seen date[] := '{}';
  v_min date;
  v_max date;
  v_week_id uuid;
  v_menu_date_id uuid;
  v_service boolean;
  v_date_cutoff time;
  v_box_count int;
  v_key text;
  v_qty_text text;
  v_qty int;
  v_box_id uuid;
  v_box_name text;
  v_addon_id uuid;
  v_addon_name text;
  v_price numeric;
  v_available boolean;
  v_desc text;
  v_items jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_total numeric;
  v_order_id uuid;
  v_screenshot_path text;
begin
  -- ---------- duplicate-submit protection ----------
  begin
    v_request_id := (p_order->>'client_request_id')::uuid;
  exception when others then
    v_request_id := null;
  end;
  if v_request_id is null then
    perform raise_checkout_error('INVALID_REQUEST', 'Something went wrong preparing your order. Please try again.');
  end if;
  -- Serialise concurrent submits of the same checkout, then return the
  -- existing order if this one was already placed.
  perform pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));
  select id into v_existing from orders where client_request_id = v_request_id;
  if v_existing is not null then
    return order_confirmation_summary(v_existing);
  end if;

  select * into v_settings from business_settings limit 1;
  if not found then
    perform raise_checkout_error('NOT_AVAILABLE', 'Ordering is not available right now.');
  end if;

  -- ---------- customer details ----------
  -- Mobile number → one canonical form (+91 and 10 digits) so
  -- "98765 43210", "+91 98765 43210" and "919876543210" are the same customer.
  if length(v_digits) = 12 and left(v_digits, 2) = '91' then
    v_digits := substr(v_digits, 3);
  end if;
  if v_digits !~ '^[6-9]\d{9}$' then
    perform raise_checkout_error('INVALID_CUSTOMER', 'Please enter a valid 10-digit mobile number.');
  end if;
  v_phone := '+91' || v_digits;
  if length(v_name) < 1 or length(v_name) > 100 then
    perform raise_checkout_error('INVALID_CUSTOMER', 'Please enter your name.');
  end if;
  if length(v_address) < 5 or length(v_address) > 500 then
    perform raise_checkout_error('INVALID_CUSTOMER', 'Please enter your full delivery address.');
  end if;
  if v_landmark is not null and length(v_landmark) > 300 then
    perform raise_checkout_error('INVALID_CUSTOMER', 'Landmark / delivery instructions are too long.');
  end if;
  begin
    v_lat := nullif(p_order#>>'{customer,latitude}', '')::numeric;
    v_lng := nullif(p_order#>>'{customer,longitude}', '')::numeric;
  exception when others then
    perform raise_checkout_error('INVALID_CUSTOMER', 'The selected map location is not valid. Please choose it again.');
  end;
  if (v_lat is null) <> (v_lng is null)
     or (v_lat is not null and (v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180)) then
    perform raise_checkout_error('INVALID_CUSTOMER', 'The selected map location is not valid. Please choose it again.');
  end if;
  v_lat := round(v_lat, 6);
  v_lng := round(v_lng, 6);

  -- ---------- plan + dates ----------
  if v_plan is null or v_plan not in ('daily', 'weekly', 'monthly') then
    perform raise_checkout_error('INVALID_REQUEST', 'Please choose Daily, Weekly or Monthly.');
  end if;
  if v_dates is null or jsonb_typeof(v_dates) <> 'array' or jsonb_array_length(v_dates) = 0 then
    perform raise_checkout_error('INVALID_REQUEST', 'Please choose at least one delivery date.');
  end if;
  if jsonb_array_length(v_dates) > 31 then
    perform raise_checkout_error('INVALID_REQUEST', 'Too many delivery dates in one order.');
  end if;

  for v_entry in select value from jsonb_array_elements(v_dates)
  loop
    begin
      v_date := (v_entry->>'date')::date;
    exception when others then
      v_date := null;
    end;
    if v_date is null then
      perform raise_checkout_error('INVALID_REQUEST', 'One of the delivery dates is not valid.');
    end if;
    v_label := to_char(v_date, 'Dy FMDD Mon');
    if v_date = any (v_seen) then
      perform raise_checkout_error('INVALID_REQUEST', format('%s appears twice in the order.', v_label));
    end if;
    v_seen := v_seen || v_date;
    v_min := least(coalesce(v_min, v_date), v_date);
    v_max := greatest(coalesce(v_max, v_date), v_date);

    -- Date rules (same as the app: no past dates, Sundays, holidays or
    -- no-service days; must have a published menu; order cutoff).
    if v_date <= v_now_local::date then
      perform raise_checkout_error('DATE_NOT_AVAILABLE', format('%s is no longer available for delivery.', v_label));
    end if;
    if extract(dow from v_date) = 0 and v_settings.sunday_is_holiday then
      perform raise_checkout_error('DATE_NOT_AVAILABLE', format('%s is a Sunday holiday.', v_label));
    end if;
    if exists (select 1 from business_holidays where holiday_date = v_date) then
      perform raise_checkout_error('DATE_NOT_AVAILABLE', format('%s is a holiday.', v_label));
    end if;

    select id into v_week_id
    from menu_weeks
    where status = 'published' and v_date between week_start_date and week_end_date
    limit 1;
    if v_week_id is null then
      perform raise_checkout_error('MENU_NOT_AVAILABLE', format('The menu for %s is not available.', v_label));
    end if;

    v_menu_date_id := null;
    v_service := true;
    v_date_cutoff := null;
    select id, is_service_available, cutoff_time
      into v_menu_date_id, v_service, v_date_cutoff
    from menu_dates
    where delivery_date = v_date and menu_week_id = v_week_id;
    if v_menu_date_id is not null and not v_service then
      perform raise_checkout_error('DATE_NOT_AVAILABLE', format('There is no delivery on %s.', v_label));
    end if;
    -- Orders for a date close at the cutoff time on the previous day.
    if v_now_local >= (v_date - 1) + coalesce(v_date_cutoff, v_settings.default_cutoff_time) then
      perform raise_checkout_error('ORDER_CUTOFF_PASSED', format('Orders for %s have closed.', v_label));
    end if;

    -- ---------- boxes (prices from the database only) ----------
    v_box_count := 0;
    for v_key, v_qty_text in select key, value from jsonb_each_text(coalesce(v_entry->'boxes', '{}'::jsonb))
    loop
      if v_qty_text !~ '^\d{1,2}$' or v_qty_text::int > 20 then
        perform raise_checkout_error('INVALID_REQUEST', format('Box quantities must be between 0 and 20 (%s).', v_label));
      end if;
      v_qty := v_qty_text::int;
      continue when v_qty = 0;

      select id, name into v_box_id, v_box_name from box_types where code = v_key and is_active;
      if v_box_id is null then
        perform raise_checkout_error('INVALID_REQUEST', 'An unknown box was in the order.');
      end if;

      -- A date-specific configuration replaces the week's default.
      v_price := null; v_available := null; v_desc := null;
      select price, is_available, description into v_price, v_available, v_desc
      from date_box_configurations
      where v_menu_date_id is not null and menu_date_id = v_menu_date_id and box_type_id = v_box_id;
      if not found then
        select price, is_available, description into v_price, v_available, v_desc
        from weekly_box_configurations
        where menu_week_id = v_week_id and box_type_id = v_box_id;
      end if;
      if not coalesce(v_available, false) or v_price is null then
        perform raise_checkout_error('ITEM_NOT_AVAILABLE', format('%s is not available on %s.', v_box_name, v_label));
      end if;

      v_box_count := v_box_count + v_qty;
      v_subtotal := v_subtotal + v_price * v_qty;
      v_items := v_items || jsonb_build_object(
        'delivery_date', v_date, 'item_type', 'box', 'box_type_id', v_box_id, 'addon_id', null,
        'name', v_box_name, 'description', v_desc,
        'unit_price', v_price, 'quantity', v_qty, 'total_price', v_price * v_qty);
    end loop;

    -- Add-ons alone are never a delivery.
    if v_box_count = 0 then
      perform raise_checkout_error('NO_BOX_FOR_DATE', format('Please add at least one box for %s.', v_label));
    end if;

    -- ---------- add-ons (prices from the database only) ----------
    for v_key, v_qty_text in select key, value from jsonb_each_text(coalesce(v_entry->'addons', '{}'::jsonb))
    loop
      if v_qty_text !~ '^\d{1,2}$' or v_qty_text::int > 20 then
        perform raise_checkout_error('INVALID_REQUEST', format('Add-on quantities must be between 0 and 20 (%s).', v_label));
      end if;
      v_qty := v_qty_text::int;
      continue when v_qty = 0;

      v_addon_id := null;
      begin
        select id, name into v_addon_id, v_addon_name from addons where id = v_key::uuid;
      exception when others then
        v_addon_id := null;
      end;
      if v_addon_id is null then
        perform raise_checkout_error('INVALID_REQUEST', 'An unknown add-on was in the order.');
      end if;

      v_price := null; v_available := null;
      select price, is_available into v_price, v_available
      from date_addon_configurations
      where v_menu_date_id is not null and menu_date_id = v_menu_date_id and addon_id = v_addon_id;
      if not found then
        select price, is_available into v_price, v_available
        from weekly_addon_configurations
        where menu_week_id = v_week_id and addon_id = v_addon_id;
      end if;
      if not coalesce(v_available, false) or v_price is null then
        perform raise_checkout_error('ITEM_NOT_AVAILABLE', format('%s is not available on %s.', v_addon_name, v_label));
      end if;

      v_subtotal := v_subtotal + v_price * v_qty;
      v_items := v_items || jsonb_build_object(
        'delivery_date', v_date, 'item_type', 'addon', 'box_type_id', null, 'addon_id', v_addon_id,
        'name', v_addon_name, 'description', null,
        'unit_price', v_price, 'quantity', v_qty, 'total_price', v_price * v_qty);
    end loop;
  end loop;

  -- Plan shape: a weekly plan stays within one Monday–Saturday week, a
  -- monthly plan within one calendar month.
  if v_plan = 'weekly' and date_trunc('week', v_min) <> date_trunc('week', v_max) then
    perform raise_checkout_error('INVALID_REQUEST', 'A weekly plan must be within one week.');
  end if;
  if v_plan = 'monthly' and date_trunc('month', v_min) <> date_trunc('month', v_max) then
    perform raise_checkout_error('INVALID_REQUEST', 'A monthly plan must be within one month.');
  end if;

  v_total := v_subtotal + v_settings.delivery_fee;

  -- ---------- payment ----------
  begin
    v_amount := (v_pay->>'amount')::numeric;
  exception when others then
    v_amount := null;
  end;
  if v_amount is null or round(v_amount, 2) <> round(v_total, 2) then
    perform raise_checkout_error(
      'PAYMENT_AMOUNT_MISMATCH',
      'The paid amount does not match the order total.',
      to_char(v_total, 'FM9999990.00'));
  end if;
  if v_utr is null and v_txn is null then
    perform raise_checkout_error('PAYMENT_REFERENCE_REQUIRED', 'Please provide the transaction ID or UTR / RRN from your payment.');
  end if;
  if v_utr is not null and v_utr !~ '^\d{12}$' then
    perform raise_checkout_error('INVALID_PAYMENT', 'The UTR / RRN must be 12 digits.');
  end if;
  if v_txn is not null and v_txn !~ '^[A-Za-z0-9]{8,40}$' then
    perform raise_checkout_error('INVALID_PAYMENT', 'The transaction ID is not valid.');
  end if;
  if exists (
    select 1 from payments
    where (v_utr is not null and utr_reference = v_utr)
       or (v_txn is not null and transaction_id = v_txn)
  ) then
    perform raise_checkout_error('DUPLICATE_PAYMENT_REFERENCE', 'This payment has already been used for another order.');
  end if;
  if v_ext not in ('jpg', 'jpeg', 'png', 'webp', 'heic', 'heif') then
    perform raise_checkout_error('SCREENSHOT_REQUIRED', 'Please upload your payment screenshot (JPG, PNG, WEBP or HEIC).');
  end if;
  begin
    v_paid_at := nullif(v_pay->>'paid_at', '')::timestamptz;
  exception when others then
    v_paid_at := null;
  end;
  if v_paid_at > now() + interval '10 minutes' then
    v_paid_at := null; -- a payment time in the future can't be right
  end if;

  -- ---------- customer: find by mobile number, or create ----------
  -- (Only after every validation above passed, so a rejected order never
  -- creates or changes a customer.)
  insert into user_profiles (phone, full_name, role)
  values (v_phone, v_name, 'customer')
  on conflict (phone) do nothing
  returning id into v_customer_id;

  if v_customer_id is null then
    -- Existing customer: reuse the profile. Their saved name is only filled
    -- in if it was empty — a mobile number isn't proof of identity, so an
    -- order never overwrites someone's saved details. The order itself
    -- always records the name/address typed for it.
    select id, is_active into v_customer_id, v_customer_active from user_profiles where phone = v_phone;
    if not v_customer_active then
      perform raise_checkout_error('CUSTOMER_INACTIVE', 'We can''t take orders for this mobile number. Please contact Thanjai Healthy Plate.');
    end if;
    update user_profiles set full_name = v_name where id = v_customer_id and (full_name is null or btrim(full_name) = '');
  end if;

  -- Light abuse guard: at most 5 orders per mobile number per hour.
  if (select count(*) from orders where customer_id = v_customer_id and placed_at > now() - interval '1 hour') >= 5 then
    perform raise_checkout_error('TOO_MANY_ORDERS', 'Too many orders from this mobile number in the last hour. Please try again later.');
  end if;

  -- Address: reuse a saved address with the same text (ignoring case and
  -- spacing); otherwise save it as a new address. Existing addresses are
  -- never edited or deleted. The address used becomes the default.
  select id into v_address_id
  from customer_addresses
  where user_id = v_customer_id
    and lower(regexp_replace(btrim(address_line_1), '\s+', ' ', 'g')) = lower(regexp_replace(v_address, '\s+', ' ', 'g'))
    and coalesce(lower(regexp_replace(btrim(landmark), '\s+', ' ', 'g')), '') = coalesce(lower(regexp_replace(v_landmark, '\s+', ' ', 'g')), '')
  order by is_default desc, created_at desc
  limit 1;

  if v_address_id is null then
    update customer_addresses set is_default = false where user_id = v_customer_id and is_default;
    insert into customer_addresses (user_id, address_line_1, landmark, is_default, latitude, longitude)
    values (v_customer_id, v_address, v_landmark, true, v_lat, v_lng)
    returning id into v_address_id;
  elsif not exists (select 1 from customer_addresses where id = v_address_id and is_default) then
    update customer_addresses set is_default = false where user_id = v_customer_id and is_default;
    update customer_addresses set is_default = true where id = v_address_id;
  end if;
  -- A reused address gets the pin if it had none. (Each order keeps its
  -- own exact pin in its snapshot below, so an existing pin is never moved.)
  if v_lat is not null then
    update customer_addresses set latitude = v_lat, longitude = v_lng
    where id = v_address_id and latitude is null;
  end if;

  -- ---------- create order + items + pending payment ----------
  insert into orders (
    customer_id, address_id, delivery_address_snapshot, plan_type,
    subtotal, delivery_fee, discount_amount, total_amount, client_request_id
  ) values (
    v_customer_id, v_address_id,
    jsonb_build_object('name', v_name, 'phone', v_phone, 'address', v_address, 'landmark', v_landmark,
                       'latitude', v_lat, 'longitude', v_lng),
    v_plan, v_subtotal, v_settings.delivery_fee, 0, v_total, v_request_id
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, delivery_date, item_type, box_type_id, addon_id,
    item_name_snapshot, item_description_snapshot, unit_price, quantity, total_price
  )
  select v_order_id, x.delivery_date, x.item_type, x.box_type_id, x.addon_id,
         x.name, x.description, x.unit_price, x.quantity, x.total_price
  from jsonb_to_recordset(v_items) as x(
    delivery_date date, item_type text, box_type_id uuid, addon_id uuid,
    name text, description text, unit_price numeric, quantity int, total_price numeric);

  -- Random, unguessable storage path reserved for this payment's
  -- screenshot; only this path can be uploaded to (see storage policy).
  v_screenshot_path := v_order_id::text || '/' || gen_random_uuid()::text || '.' || v_ext;

  begin
    insert into payments (order_id, payment_method, amount, utr_reference, transaction_id, paid_at, screenshot_path, payment_status)
    values (v_order_id, 'upi', v_total, v_utr, v_txn, v_paid_at, v_screenshot_path, 'pending');
  exception when unique_violation then
    perform raise_checkout_error('DUPLICATE_PAYMENT_REFERENCE', 'This payment has already been used for another order.');
  end;

  return order_confirmation_summary(v_order_id);
end;
$$;

-- ============================================================
-- 4. Admin order details: + delivered_at and the address pin (rest unchanged from 0003)
-- ============================================================
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
    'delivered_at', o.delivered_at,
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
        'landmark', a.landmark, 'city', a.city, 'pincode', a.pincode,
        'latitude', a.latitude, 'longitude', a.longitude)
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

-- ============================================================
-- 5. Delivery steps (existing order_status values; no new statuses)
-- ============================================================
create or replace function admin_set_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_current text;
  v_payment_status text;
  v_allowed boolean;
begin
  perform admin_assert();
  if p_status not in ('pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled') then
    perform admin_error('INVALID_REQUEST', 'Unknown order status.');
  end if;
  select order_status, payment_status into v_current, v_payment_status
  from orders where id = p_order_id for update;
  if not found then
    perform admin_error('NOT_FOUND', 'Order not found.');
  end if;
  if p_status = v_current then
    return admin_get_order(p_order_id);
  end if;

  -- One step forward at a time; cancel any time before delivery.
  v_allowed := case p_status
    when 'confirmed' then v_current = 'pending'
    when 'preparing' then v_current = 'confirmed'
    when 'out_for_delivery' then v_current = 'preparing'
    when 'delivered' then v_current = 'out_for_delivery'
    when 'cancelled' then v_current not in ('delivered', 'cancelled')
    else false
  end;
  if not v_allowed then
    perform admin_error('INVALID_STATUS_CHANGE',
      format('Can''t change an order from %s to %s.', replace(v_current, '_', ' '), replace(p_status, '_', ' ')));
  end if;
  if p_status <> 'cancelled' and v_payment_status <> 'paid' then
    perform admin_error('PAYMENT_NOT_VERIFIED', 'Verify the payment before moving this order forward.');
  end if;

  update orders
    set order_status = p_status,
        delivered_at = case when p_status = 'delivered' then now() else delivered_at end
    where id = p_order_id;
  return admin_get_order(p_order_id);
end;
$$;

-- Function permissions are kept by CREATE OR REPLACE; restated for clarity.
revoke all on function place_customer_order(jsonb) from public;
grant execute on function place_customer_order(jsonb) to anon, authenticated;
revoke all on function admin_get_order(uuid) from public, anon;
grant execute on function admin_get_order(uuid) to authenticated;
revoke all on function admin_set_order_status(uuid, text) from public, anon;
grant execute on function admin_set_order_status(uuid, text) to authenticated;

commit;
