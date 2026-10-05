-- Thanjai Healthy Plate — initial schema
--
-- NOT EXECUTED YET. This file is prepared for review only. Run it manually
-- in the Supabase SQL Editor (or via `supabase db push`) only after it has
-- been reviewed and approved.
--
-- Single-business application: no business_id / tenant columns anywhere.
-- Box 1 and Box 2 are fixed identities (see box_types below); only their
-- weekly/date-specific content, price, and availability are configurable.

create extension if not exists pgcrypto;

-- ============================================================
-- Helper: keep updated_at current on every row update
-- ============================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 1. user_profiles
-- One row per auth.users row (id is shared, not a separate uuid) — the
-- standard Supabase pattern. Keeps RLS simple: id = auth.uid().
-- ============================================================
create table user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text unique,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_profiles_set_updated_at
  before update on user_profiles
  for each row execute function set_updated_at();

-- Admin-check used throughout RLS policies (and the trigger just below).
-- security definer lets it read user_profiles even when the calling
-- policy's own RLS would otherwise block that read (avoids recursive-
-- policy issues) — defined here, first, so everything below can use it.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

-- SECURITY: without this, the user_profiles UPDATE policy below (which
-- must let customers edit their own name/phone) would also let a
-- customer silently set their own role to 'admin', since Postgres RLS
-- uses the USING clause as the WITH CHECK when none is given, and the
-- USING clause is only "id = auth.uid()" — role isn't part of that
-- check. This trigger forces role/is_active back to their previous
-- value on any update performed by someone who isn't already an admin.
create or replace function protect_user_profile_privileges()
returns trigger
language plpgsql
as $$
begin
  if not is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
  end if;
  return new;
end;
$$;

create trigger user_profiles_protect_privileges
  before update on user_profiles
  for each row execute function protect_user_profile_privileges();

-- Auto-create a customer profile whenever someone completes phone-OTP
-- sign-up. security definer lets this run even though user_profiles has
-- RLS enabled (see Phase 4 policies below).
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, phone, role)
  values (new.id, new.phone, 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ============================================================
-- 2. customer_addresses
-- ============================================================
create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles (id) on delete cascade,
  address_label text,
  address_line_1 text not null,
  address_line_2 text,
  landmark text,
  city text not null default 'Thanjavur',
  state text not null default 'Tamil Nadu',
  pincode text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger customer_addresses_set_updated_at
  before update on customer_addresses
  for each row execute function set_updated_at();

create index customer_addresses_user_id_idx on customer_addresses (user_id);

-- Only one default address per customer.
create unique index customer_addresses_one_default_per_user
  on customer_addresses (user_id)
  where is_default;

-- ============================================================
-- 3. menu_weeks
-- week_start_date must be a Monday (dow = 1); the week always runs
-- Monday–Saturday, Sunday is never a delivery day.
-- ============================================================
create table menu_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null unique,
  week_end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_weeks_start_is_monday check (extract(dow from week_start_date) = 1),
  constraint menu_weeks_end_after_start check (week_end_date > week_start_date)
);

create trigger menu_weeks_set_updated_at
  before update on menu_weeks
  for each row execute function set_updated_at();

-- ============================================================
-- 4. box_types
-- Fixed identities: exactly Box 1 and Box 2. No insert/delete policy is
-- granted to anyone (see Phase 4) — this table's rows never change after
-- the seed below, enforcing "identity is fixed" at the database level.
-- ============================================================
create table box_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('BOX_1', 'BOX_2')),
  name text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger box_types_set_updated_at
  before update on box_types
  for each row execute function set_updated_at();

-- ============================================================
-- 5. weekly_box_configurations
-- The default content/price/availability for a box within one menu week.
-- ============================================================
create table weekly_box_configurations (
  id uuid primary key default gen_random_uuid(),
  menu_week_id uuid not null references menu_weeks (id) on delete cascade,
  box_type_id uuid not null references box_types (id) on delete restrict,
  name text,
  description text,
  contents jsonb not null default '[]'::jsonb,
  price numeric(10, 2) check (price is null or price >= 0),
  is_available boolean not null default false,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_week_id, box_type_id)
);

create trigger weekly_box_configurations_set_updated_at
  before update on weekly_box_configurations
  for each row execute function set_updated_at();

create index weekly_box_configurations_week_idx on weekly_box_configurations (menu_week_id);

-- ============================================================
-- 6. menu_dates
-- A row only exists for days the business could ever deliver on — Sunday
-- (dow = 0) is structurally excluded: no row can ever represent a Sunday.
-- ============================================================
create table menu_dates (
  id uuid primary key default gen_random_uuid(),
  menu_week_id uuid not null references menu_weeks (id) on delete cascade,
  delivery_date date not null unique,
  is_service_available boolean not null default true,
  holiday_reason text,
  -- Daily local time (e.g. 22:00), not a specific date/instant — a plain
  -- `time` column, same type as business_settings.default_cutoff_time.
  cutoff_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_dates_not_sunday check (extract(dow from delivery_date) <> 0)
);

create trigger menu_dates_set_updated_at
  before update on menu_dates
  for each row execute function set_updated_at();

create index menu_dates_week_idx on menu_dates (menu_week_id);

-- ============================================================
-- 7. date_box_configurations
-- Date-specific override of a box's content/price/availability. Only
-- used when a particular date needs to differ from the week's default.
-- ============================================================
create table date_box_configurations (
  id uuid primary key default gen_random_uuid(),
  menu_date_id uuid not null references menu_dates (id) on delete cascade,
  box_type_id uuid not null references box_types (id) on delete restrict,
  name text,
  description text,
  contents jsonb,
  price numeric(10, 2) check (price is null or price >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_date_id, box_type_id)
);

create trigger date_box_configurations_set_updated_at
  before update on date_box_configurations
  for each row execute function set_updated_at();

create index date_box_configurations_date_idx on date_box_configurations (menu_date_id);

-- ============================================================
-- 8. addons
-- ============================================================
create table addons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger addons_set_updated_at
  before update on addons
  for each row execute function set_updated_at();

-- ============================================================
-- 9. weekly_addon_configurations
-- ============================================================
create table weekly_addon_configurations (
  id uuid primary key default gen_random_uuid(),
  menu_week_id uuid not null references menu_weeks (id) on delete cascade,
  addon_id uuid not null references addons (id) on delete cascade,
  price numeric(10, 2) not null check (price >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_week_id, addon_id)
);

create trigger weekly_addon_configurations_set_updated_at
  before update on weekly_addon_configurations
  for each row execute function set_updated_at();

-- ============================================================
-- 10. date_addon_configurations
-- ============================================================
create table date_addon_configurations (
  id uuid primary key default gen_random_uuid(),
  menu_date_id uuid not null references menu_dates (id) on delete cascade,
  addon_id uuid not null references addons (id) on delete cascade,
  price numeric(10, 2) check (price is null or price >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_date_id, addon_id)
);

create trigger date_addon_configurations_set_updated_at
  before update on date_addon_configurations
  for each row execute function set_updated_at();

-- ============================================================
-- 11. orders
-- ============================================================
create sequence order_number_seq;

create or replace function generate_order_number()
returns text
language sql
as $$
  select 'THP' || to_char(now(), 'YYMMDD') || lpad(nextval('order_number_seq')::text, 4, '0');
$$;

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default generate_order_number(),
  customer_id uuid not null references user_profiles (id) on delete restrict,
  address_id uuid references customer_addresses (id) on delete set null,
  -- Snapshot of the address at order time, same principle as
  -- order_items' snapshots: if the customer later edits or deletes this
  -- address, this order's delivery details must not change retroactively.
  delivery_address_snapshot jsonb,
  plan_type text not null check (plan_type in ('daily', 'weekly', 'monthly')),
  order_status text not null default 'pending'
    check (order_status in ('pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled')),
  -- Deliberately separate from order_status: payment can be pending
  -- verification while the order itself is already confirmed for prep.
  payment_status text not null default 'payment_verification_pending'
    check (payment_status in ('payment_verification_pending', 'paid', 'rejected', 'refunded')),
  subtotal numeric(10, 2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(10, 2) not null default 0 check (delivery_fee >= 0),
  discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(10, 2) not null default 0 check (total_amount >= 0),
  customer_notes text,
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_reconciles check (total_amount = subtotal + delivery_fee - discount_amount)
);

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

create index orders_customer_idx on orders (customer_id);
create index orders_status_idx on orders (order_status);

-- ============================================================
-- 12. order_items
-- Snapshots item name/description/price at order time — later menu
-- edits never change historical orders.
-- ============================================================
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  delivery_date date not null,
  item_type text not null check (item_type in ('box', 'addon')),
  box_type_id uuid references box_types (id) on delete set null,
  addon_id uuid references addons (id) on delete set null,
  item_name_snapshot text not null,
  item_description_snapshot text,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  quantity int not null check (quantity > 0),
  total_price numeric(10, 2) not null check (total_price >= 0),
  created_at timestamptz not null default now(),
  constraint order_items_type_matches_reference check (
    (item_type = 'box' and box_type_id is not null and addon_id is null)
    or (item_type = 'addon' and addon_id is not null and box_type_id is null)
  ),
  constraint order_items_total_reconciles check (total_price = unit_price * quantity)
);

create index order_items_order_idx on order_items (order_id);
create index order_items_delivery_date_idx on order_items (delivery_date);

-- ============================================================
-- 13. payments
-- utr_reference is globally unique (when present) to prevent the same
-- bank transaction being submitted against more than one order.
-- ============================================================
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  payment_method text not null default 'upi' check (payment_method in ('upi')),
  amount numeric(10, 2) not null check (amount >= 0),
  utr_reference text,
  screenshot_path text,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'approved', 'rejected')),
  verified_by uuid references user_profiles (id) on delete set null,
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();

create index payments_order_idx on payments (order_id);

create unique index payments_utr_reference_unique
  on payments (utr_reference)
  where utr_reference is not null;

-- ============================================================
-- 14. business_settings
-- Singleton table: the boolean primary key can only ever be `true`, so
-- at most one row can ever exist.
-- ============================================================
create table business_settings (
  id boolean primary key default true check (id),
  default_cutoff_time time not null default '22:00',
  delivery_start_time time not null default '06:00',
  delivery_end_time time not null default '08:00',
  delivery_radius_km numeric(5, 2) not null default 5,
  delivery_fee numeric(10, 2) not null default 0,
  upi_id text,
  upi_qr_image_url text,
  sunday_is_holiday boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_settings_set_updated_at
  before update on business_settings
  for each row execute function set_updated_at();

-- ============================================================
-- 15. business_holidays
-- ============================================================
create table business_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  reason text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table user_profiles enable row level security;
alter table customer_addresses enable row level security;
alter table menu_weeks enable row level security;
alter table box_types enable row level security;
alter table weekly_box_configurations enable row level security;
alter table menu_dates enable row level security;
alter table date_box_configurations enable row level security;
alter table addons enable row level security;
alter table weekly_addon_configurations enable row level security;
alter table date_addon_configurations enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table business_settings enable row level security;
alter table business_holidays enable row level security;

-- user_profiles: read/update own row; admin can read/update any row.
-- No delete policy — deactivate via is_active instead of deleting.
create policy user_profiles_select on user_profiles
  for select using (id = auth.uid() or is_admin());
-- role is pinned to 'customer' here too (not just in the trigger above)
-- as defense-in-depth: the trigger only fires on UPDATE, so this closes
-- the same escalation path at INSERT in case the auto-create trigger on
-- auth.users is ever missing or changed later.
create policy user_profiles_insert on user_profiles
  for insert with check (id = auth.uid() and role = 'customer');
create policy user_profiles_update on user_profiles
  for update using (id = auth.uid() or is_admin());

-- customer_addresses: fully owned by the customer; admin can manage all.
create policy customer_addresses_select on customer_addresses
  for select using (user_id = auth.uid() or is_admin());
create policy customer_addresses_insert on customer_addresses
  for insert with check (user_id = auth.uid());
create policy customer_addresses_update on customer_addresses
  for update using (user_id = auth.uid() or is_admin());
create policy customer_addresses_delete on customer_addresses
  for delete using (user_id = auth.uid() or is_admin());

-- menu_weeks: customers can see published weeks; admin manages all.
create policy menu_weeks_select on menu_weeks
  for select using (status = 'published' or is_admin());
create policy menu_weeks_admin_write on menu_weeks
  for all using (is_admin()) with check (is_admin());

-- box_types: readable by everyone (including anonymous browsing);
-- only admin can update (name/display_order/is_active). No insert/delete
-- policy for anyone — the two rows are fixed by the seed data below.
create policy box_types_select on box_types
  for select using (true);
create policy box_types_admin_update on box_types
  for update using (is_admin()) with check (is_admin());

-- weekly_box_configurations: visible when the parent week is published;
-- admin manages all.
create policy weekly_box_configurations_select on weekly_box_configurations
  for select using (
    is_admin() or exists (
      select 1 from menu_weeks w
      where w.id = menu_week_id and w.status = 'published'
    )
  );
create policy weekly_box_configurations_admin_write on weekly_box_configurations
  for all using (is_admin()) with check (is_admin());

-- menu_dates: same visibility rule as their parent week.
create policy menu_dates_select on menu_dates
  for select using (
    is_admin() or exists (
      select 1 from menu_weeks w
      where w.id = menu_week_id and w.status = 'published'
    )
  );
create policy menu_dates_admin_write on menu_dates
  for all using (is_admin()) with check (is_admin());

-- date_box_configurations: visible when the parent date's week is published.
create policy date_box_configurations_select on date_box_configurations
  for select using (
    is_admin() or exists (
      select 1 from menu_dates d
      join menu_weeks w on w.id = d.menu_week_id
      where d.id = menu_date_id and w.status = 'published'
    )
  );
create policy date_box_configurations_admin_write on date_box_configurations
  for all using (is_admin()) with check (is_admin());

-- addons: readable by everyone; only admin can manage.
create policy addons_select on addons
  for select using (true);
create policy addons_admin_write on addons
  for all using (is_admin()) with check (is_admin());

-- weekly_addon_configurations: same published-week visibility rule.
create policy weekly_addon_configurations_select on weekly_addon_configurations
  for select using (
    is_admin() or exists (
      select 1 from menu_weeks w
      where w.id = menu_week_id and w.status = 'published'
    )
  );
create policy weekly_addon_configurations_admin_write on weekly_addon_configurations
  for all using (is_admin()) with check (is_admin());

-- date_addon_configurations: same published-week visibility rule.
create policy date_addon_configurations_select on date_addon_configurations
  for select using (
    is_admin() or exists (
      select 1 from menu_dates d
      join menu_weeks w on w.id = d.menu_week_id
      where d.id = menu_date_id and w.status = 'published'
    )
  );
create policy date_addon_configurations_admin_write on date_addon_configurations
  for all using (is_admin()) with check (is_admin());

-- orders: customers may only ever read their own row (via ownership).
-- No customer INSERT policy, deliberately — see below.
create policy orders_select on orders
  for select using (customer_id = auth.uid() or is_admin());

-- SECURITY: pinning order_status/payment_status on a customer INSERT (an
-- earlier version of this policy did exactly that) stops a customer from
-- claiming an order is already 'delivered' or 'paid', but it does NOT
-- stop them from inserting whatever subtotal/delivery_fee/discount_amount
-- /total_amount they want — the orders_total_reconciles CHECK only
-- verifies those four numbers are internally consistent with each other,
-- never that they reflect real menu prices. That's the same class of
-- problem as order_items (see its policy below): trusting client-
-- supplied prices at all is the actual issue, not which status a
-- customer can set.
--
-- Safest simple fix: no customer INSERT policy on orders at all. Order
-- creation is admin/trusted-function only, symmetric with order_items.
-- A future SECURITY DEFINER order-placement function computes real
-- prices from weekly_box_configurations/date_box_configurations (and
-- the addon equivalents), then creates the order + its order_items
-- together in one transaction — bypassing both admin-only policies via
-- SECURITY DEFINER, the same mechanism is_admin() and
-- handle_new_auth_user() already use elsewhere in this file. Not built
-- yet; this migration just establishes the secure foundation for it.
create policy orders_admin_write on orders
  for all using (is_admin()) with check (is_admin());

-- order_items: customers may only ever read their own order's line
-- items (via the parent order's ownership) — see below for why writing
-- is admin/trusted-function only, not a customer policy.
create policy order_items_select on order_items
  for select using (
    is_admin() or exists (
      select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()
    )
  );
-- SECURITY: order_items has no customer INSERT policy, deliberately.
-- Letting customers write item_name_snapshot/unit_price/total_price
-- directly would let them set any price they want for any box/add-on —
-- the CHECK constraints above only verify internal arithmetic
-- consistency (total_price = unit_price * quantity), never that
-- unit_price matches what the admin actually configured for that box on
-- that date. Correctly validating that would mean re-implementing the
-- app's whole menu-price resolution (default vs. date-override, per
-- box/add-on) as a SQL EXISTS clause — real, but exactly the kind of
-- duplicated, drift-prone logic worth avoiding.
--
-- Order placement must instead go through a trusted, price-computing
-- path: a SECURITY DEFINER Postgres function or a server-side route
-- using the customer's own session, which reads real prices from
-- weekly_box_configurations/date_box_configurations (and the addon
-- equivalents) and writes order_items itself. Such a function is
-- unaffected by this policy being admin-only, the same way is_admin()
-- and handle_new_auth_user() already bypass RLS via SECURITY DEFINER
-- elsewhere in this file. Not built yet — this is a placeholder note
-- for when order placement is implemented.
create policy order_items_admin_write on order_items
  for all using (is_admin()) with check (is_admin());

-- payments: customer can submit a payment for their own order but
-- cannot change its status afterward — only admin verifies/rejects.
create policy payments_select on payments
  for select using (
    is_admin() or exists (
      select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()
    )
  );
-- SECURITY: order ownership alone isn't enough — without pinning
-- payment_status/verified_by/verified_at, a customer's INSERT payload
-- could self-approve a payment (payment_status: 'approved', a fabricated
-- verified_by/verified_at), skipping manual admin verification entirely.
create policy payments_insert on payments
  for insert with check (
    exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid())
    and payment_status = 'pending'
    and verified_by is null
    and verified_at is null
  );
create policy payments_admin_update on payments
  for update using (is_admin()) with check (is_admin());

-- business_settings: public read (customers need delivery window / UPI
-- details at checkout); only admin can change it.
create policy business_settings_select on business_settings
  for select using (true);
create policy business_settings_admin_write on business_settings
  for all using (is_admin()) with check (is_admin());

-- business_holidays: public read (date pickers need this); only admin
-- can manage.
create policy business_holidays_select on business_holidays
  for select using (true);
create policy business_holidays_admin_write on business_holidays
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- Seed data
-- ============================================================

insert into box_types (code, name, display_order) values
  ('BOX_1', 'Box 1', 1),
  ('BOX_2', 'Box 2', 2);

insert into addons (name, code) values
  ('Juice', 'JUICE'),
  ('Koozh', 'KOOZH');

insert into business_settings (id) values (true);
-- All other business_settings columns use their defaults above:
-- cutoff 22:00, delivery window 06:00–08:00, radius 5km, Sunday holiday.
