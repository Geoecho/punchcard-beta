-- ============================================================
-- Eightysixdegrees Punchcard — one-time verified student status
-- ============================================================
-- Run this AFTER supabase-stamp-staff-avatar.sql (the latest migration
-- so far) on the same project: https://edunsrtcdhnpbsipalhc.supabase.co
--
-- WHAT THIS ADDS:
--   - customers.is_student: a boolean staff can flip on once a customer
--     has been verified as a student (however that's done today —
--     Netaville's QR, a student ID, whatever). From then on, that
--     customer's own card screen shows a student badge, so staff never
--     need to ask for separate proof again — one QR scan (this app's)
--     instead of two.
--   - staff_set_student_status(token, customer_id, is_student): the
--     only way to change it. Same staff-token verification as every
--     other staff_* action; a customer can never set this on themselves.
--
-- WHY EVERY OTHER FUNCTION BELOW IS ALSO BEING RE-CREATED:
--   Every RPC that returns a customer row gets its result saved straight
--   into local state via db.saveCustomer(...), which replaces the whole
--   cached row. If even one of them didn't return is_student, the very
--   next action through it (redeeming, changing avatar, adding a stamp,
--   anything) would silently overwrite a real "true" back down to
--   "false" on the customer's own device. So this migration adds
--   is_student to the full set uniformly, not just the ones that touch
--   it directly. Nothing else about their behavior changes.
--
--   Postgres won't let CREATE OR REPLACE change a function's return
--   shape, so each one is DROPped first — same pattern used every time
--   this project's added a column to the shared customer-row shape.
-- ============================================================

alter table public.customers add column if not exists is_student boolean not null default false;

-- ============================================================
-- Reads
-- ============================================================

drop function if exists public.get_customer_by_id(text);
create or replace function public.get_customer_by_id(p_id text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language sql
security definer
set search_path = public, extensions
as $$
  select id, name, phone, avatar, stamps, rewards_earned, joined_at, history, total_stamps_earned, reward_banked_at, is_student
  from public.customers where id = p_id limit 1;
$$;
grant execute on function public.get_customer_by_id(text) to anon;

drop function if exists public.staff_list_customers(text);
create or replace function public.staff_list_customers(p_token text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c
    order by c.joined_at desc;
end;
$$;
grant execute on function public.staff_list_customers(text) to anon;

-- ============================================================
-- Login / signup
-- ============================================================

drop function if exists public.login_customer(text, text);
create or replace function public.login_customer(p_username text, p_password text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean, token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.customers;
  v_token text;
begin
  select c.* into v_row from public.customers c where lower(c.phone) = lower(trim(p_username)) limit 1;
  if not found or v_row.password_hash is null or crypt(p_password, v_row.password_hash) <> v_row.password_hash then
    return;
  end if;

  delete from public.customer_sessions cs where cs.customer_id = v_row.id and cs.expires_at < now();
  insert into public.customer_sessions (customer_id) values (v_row.id) returning customer_sessions.token into v_token;

  return query select v_row.id, v_row.name, v_row.phone, v_row.avatar, v_row.stamps, v_row.rewards_earned,
    v_row.joined_at, v_row.history, v_row.total_stamps_earned, v_row.reward_banked_at, v_row.is_student, v_token;
end;
$$;
grant execute on function public.login_customer(text, text) to anon;

drop function if exists public.signup_customer(text, text, text);
create or replace function public.signup_customer(p_username text, p_password text, p_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean, is_new boolean, token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_existing public.customers;
  v_new_id text;
  v_hash text;
  v_name text := coalesce(nullif(trim(p_name), ''), v_username);
  v_token text;
begin
  if v_username = '' then
    raise exception 'invalid_input';
  end if;

  select c.* into v_existing from public.customers c where lower(c.phone) = v_username limit 1;

  if found then
    if v_existing.password_hash is null or crypt(p_password, v_existing.password_hash) <> v_existing.password_hash then
      raise exception 'username_taken';
    end if;
    delete from public.customer_sessions cs where cs.customer_id = v_existing.id and cs.expires_at < now();
    insert into public.customer_sessions (customer_id) values (v_existing.id) returning customer_sessions.token into v_token;
    return query select v_existing.id, v_existing.name, v_existing.phone, v_existing.avatar,
      v_existing.stamps, v_existing.rewards_earned, v_existing.joined_at, v_existing.history,
      v_existing.total_stamps_earned, v_existing.reward_banked_at, v_existing.is_student, false, v_token;
    return;
  end if;

  if p_password is null
     or length(p_password) < 8
     or p_password !~ '[A-Z]'
     or p_password !~ '[a-z]'
     or p_password !~ '[0-9]' then
    raise exception 'weak_password';
  end if;

  v_new_id := 'cust_' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 9));
  v_hash := crypt(p_password, gen_salt('bf'));

  insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, password_hash, total_stamps_earned)
  values (v_new_id, v_name, v_username, 'person', 0, 0, now(), '[]'::jsonb, v_hash, 0);

  insert into public.customer_sessions (customer_id) values (v_new_id) returning customer_sessions.token into v_token;

  return query select v_new_id, v_name, v_username, 'person'::text, 0, 0, now(), '[]'::jsonb, 0, null::timestamptz, false, true, v_token;
end;
$$;
grant execute on function public.signup_customer(text, text, text) to anon;

drop function if exists public.customer_login_google();
create or replace function public.customer_login_google()
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean, is_new boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := auth.email();
  v_uid uuid := auth.uid();
  v_name text := coalesce(
    nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
    nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
    split_part(coalesce(auth.email(), 'Customer'), '@', 1)
  );
  v_existing public.customers;
  v_new_id text;
begin
  if v_email is null or v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select c.* into v_existing from public.customers c where c.auth_uid = v_uid limit 1;
  if not found then
    select c.* into v_existing from public.customers c where lower(c.email) = lower(v_email) limit 1;
  end if;

  if found then
    update public.customers c set auth_uid = v_uid, email = coalesce(c.email, v_email) where c.id = v_existing.id;
    return query select v_existing.id, v_existing.name, v_existing.phone, v_existing.avatar,
      v_existing.stamps, v_existing.rewards_earned, v_existing.joined_at, v_existing.history,
      v_existing.total_stamps_earned, v_existing.reward_banked_at, v_existing.is_student, false;
    return;
  end if;

  v_new_id := 'cust_' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 9));

  insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, total_stamps_earned, email, auth_uid)
  values (v_new_id, v_name, '', 'person', 0, 0, now(), '[]'::jsonb, 0, v_email, v_uid);

  return query select v_new_id, v_name, ''::text, 'person'::text, 0, 0, now(), '[]'::jsonb, 0, null::timestamptz, false, true;
end;
$$;
grant execute on function public.customer_login_google() to authenticated;

-- ============================================================
-- Customer self-service
-- ============================================================

drop function if exists public.customer_save_self(text, text);
create or replace function public.customer_save_self(p_token text, p_avatar text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
begin
  update public.customers c set avatar = coalesce(nullif(trim(p_avatar), ''), c.avatar)
  where c.id = v_customer_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_save_self(text, text) to anon, authenticated;

drop function if exists public.customer_set_username(text, text);
create or replace function public.customer_set_username(p_token text, p_username text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
  v_username text := lower(trim(p_username));
begin
  if v_username = '' then
    raise exception 'invalid_input';
  end if;

  if exists (select 1 from public.customers c where lower(c.phone) = v_username and c.id <> v_customer_id) then
    raise exception 'username_taken';
  end if;

  update public.customers c set phone = v_username where c.id = v_customer_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_set_username(text, text) to anon, authenticated;

drop function if exists public.customer_set_display_name(text, text);
create or replace function public.customer_set_display_name(p_token text, p_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
  v_name text := trim(p_name);
  v_row public.customers;
begin
  if v_name = '' or length(v_name) > 40 then
    raise exception 'invalid_input';
  end if;

  select c.* into v_row from public.customers c where c.id = v_customer_id;

  if v_row.name_changed_at is not null and v_row.name_changed_at > now() - interval '14 days' then
    raise exception 'rate_limited:%', to_char(v_row.name_changed_at + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  update public.customers c set name = v_name, name_changed_at = now() where c.id = v_customer_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_set_display_name(text, text) to anon, authenticated;

drop function if exists public.customer_redeem_reward(text, text);
create or replace function public.customer_redeem_reward(p_token text, p_method text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
  v_row public.customers;
  v_entry jsonb;
begin
  select c.* into v_row from public.customers c where c.id = v_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;

  if p_method = 'wallet' then
    if v_row.rewards_earned <= 0 then raise exception 'no_reward_available'; end if;
    if v_row.reward_banked_at is not null and v_row.reward_banked_at < now() - interval '1 year' then
      raise exception 'reward_expired';
    end if;
    update public.customers c set
      rewards_earned = c.rewards_earned - 1,
      reward_banked_at = case when c.rewards_earned - 1 <= 0 then null else c.reward_banked_at end
    where c.id = v_customer_id;
  elsif p_method = 'direct' then
    if v_row.stamps < 10 then raise exception 'not_enough_stamps'; end if;
    update public.customers c set stamps = 0 where c.id = v_customer_id;
  else
    raise exception 'invalid_input';
  end if;

  v_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'redemption',
    'drink', 'Free Coffee',
    'method', p_method,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  update public.customers c set history = jsonb_build_array(v_entry) || coalesce(c.history, '[]'::jsonb) where c.id = v_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_redeem_reward(text, text) to anon, authenticated;

drop function if exists public.customer_bank_reward(text);
create or replace function public.customer_bank_reward(p_token text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_id text := public.customer_id_from_caller(p_token);
  v_row public.customers;
begin
  select c.* into v_row from public.customers c where c.id = v_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;
  if v_row.stamps < 10 then raise exception 'not_enough_stamps'; end if;

  update public.customers c set
    stamps = 0,
    rewards_earned = c.rewards_earned + 1,
    reward_banked_at = case when c.rewards_earned = 0 then now() else c.reward_banked_at end
  where c.id = v_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_bank_reward(text) to anon, authenticated;

-- ============================================================
-- Staff-attributed writes
-- ============================================================

drop function if exists public.staff_redeem_reward(text, text, text);
create or replace function public.staff_redeem_reward(p_token text, p_customer_id text, p_method text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_row public.customers;
  v_entry jsonb;
begin
  v_staff := public.staff_from_token(p_token);

  select c.* into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;

  if p_method = 'wallet' then
    if v_row.rewards_earned <= 0 then raise exception 'no_reward_available'; end if;
    update public.customers c set
      rewards_earned = c.rewards_earned - 1,
      reward_banked_at = case when c.rewards_earned - 1 <= 0 then null else c.reward_banked_at end
    where c.id = p_customer_id;
  elsif p_method = 'direct' then
    if v_row.stamps < 10 then raise exception 'not_enough_stamps'; end if;
    update public.customers c set stamps = 0 where c.id = p_customer_id;
  else
    raise exception 'invalid_input';
  end if;

  v_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'redemption',
    'drink', 'Free Coffee',
    'method', p_method,
    'staffName', v_staff.name,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  update public.customers c set history = jsonb_build_array(v_entry) || coalesce(c.history, '[]'::jsonb) where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_redeem_reward(text, text, text) to anon;

drop function if exists public.staff_bank_reward(text, text);
create or replace function public.staff_bank_reward(p_token text, p_customer_id text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.customers;
begin
  perform public.staff_from_token(p_token);

  select c.* into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;
  if v_row.stamps < 10 then raise exception 'not_enough_stamps'; end if;

  update public.customers c set
    stamps = 0,
    rewards_earned = c.rewards_earned + 1,
    reward_banked_at = case when c.rewards_earned = 0 then now() else c.reward_banked_at end
  where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_bank_reward(text, text) to anon;

drop function if exists public.staff_set_avatar(text, text, text);
create or replace function public.staff_set_avatar(p_token text, p_customer_id text, p_avatar text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  update public.customers c set avatar = coalesce(nullif(trim(p_avatar), ''), c.avatar) where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_set_avatar(text, text, text) to anon;

drop function if exists public.staff_create_customer(text, text, text, text);
create or replace function public.staff_create_customer(p_token text, p_customer_id text, p_name text, p_phone text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);

  if p_customer_id is null or p_customer_id = '' then
    raise exception 'invalid_input';
  end if;

  insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, total_stamps_earned)
  values (p_customer_id, coalesce(nullif(trim(p_name), ''), 'Customer'), coalesce(p_phone, ''), 'person', 0, 0, now(), '[]'::jsonb, 0)
  on conflict (id) do nothing;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_create_customer(text, text, text, text) to anon;

drop function if exists public.staff_add_stamp(text, text, integer, text);
create or replace function public.staff_add_stamp(p_token text, p_customer_id text, p_base_stamps integer, p_drink_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_row public.customers;
  v_campaign public.campaigns;
  v_effective_stamps integer;
  v_new_total integer;
  v_new_stamps integer;
  v_new_rewards integer;
  v_entry jsonb;
begin
  v_staff := public.staff_from_token(p_token);

  select c.* into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;

  select * into v_campaign from public.campaigns camp where camp.id = 1;
  v_effective_stamps := greatest(1, coalesce(p_base_stamps, 1));
  if v_campaign.active then
    v_effective_stamps := v_effective_stamps * v_campaign.multiplier;
  end if;

  v_new_total := v_row.stamps + v_effective_stamps;
  v_new_rewards := v_row.rewards_earned + (v_new_total / 10);
  v_new_stamps := v_new_total % 10;

  v_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'stamp',
    'drink', coalesce(p_drink_name, 'Drink'),
    'stamps', v_effective_stamps,
    'staffName', v_staff.name,
    'staffAvatar', v_staff.avatar,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  update public.customers c set
    stamps = v_new_stamps,
    rewards_earned = v_new_rewards,
    total_stamps_earned = c.total_stamps_earned + v_effective_stamps,
    reward_banked_at = case when c.rewards_earned = 0 and v_new_rewards > 0 then now() else c.reward_banked_at end,
    history = jsonb_build_array(v_entry) || coalesce(c.history, '[]'::jsonb)
  where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_add_stamp(text, text, integer, text) to anon;

drop function if exists public.staff_remove_stamp(text, text);
create or replace function public.staff_remove_stamp(p_token text, p_customer_id text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_row public.customers;
  v_entry jsonb;
begin
  v_staff := public.staff_from_token(p_token);

  select c.* into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;
  if v_row.stamps <= 0 then raise exception 'no_stamps_to_remove'; end if;

  v_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'stamp_removed',
    'staffName', v_staff.name,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  update public.customers c set
    stamps = c.stamps - 1,
    total_stamps_earned = greatest(0, c.total_stamps_earned - 1),
    history = jsonb_build_array(v_entry) || coalesce(c.history, '[]'::jsonb)
  where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_remove_stamp(text, text) to anon;

drop function if exists public.staff_void_last_redemption(text, text);
create or replace function public.staff_void_last_redemption(p_token text, p_customer_id text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users;
  v_row public.customers;
  v_history jsonb;
  v_idx integer := null;
  v_entry jsonb;
  v_method text;
  v_void_entry jsonb;
begin
  v_staff := public.staff_from_token(p_token);

  select c.* into v_row from public.customers c where c.id = p_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;

  v_history := coalesce(v_row.history, '[]'::jsonb);
  for i in 0 .. jsonb_array_length(v_history) - 1 loop
    v_entry := v_history -> i;
    if (v_entry ->> 'type') = 'redemption' and coalesce((v_entry ->> 'voided')::boolean, false) = false then
      v_idx := i;
      exit;
    end if;
  end loop;

  if v_idx is null then raise exception 'no_redemption_to_void'; end if;

  v_method := coalesce(v_history -> v_idx ->> 'method', 'wallet');
  v_history := jsonb_set(v_history, array[v_idx::text, 'voided'], 'true'::jsonb);

  v_void_entry := jsonb_build_object(
    'id', 'tx_' || substr(md5(random()::text || clock_timestamp()::text), 1, 7),
    'type', 'void',
    'staffName', v_staff.name,
    'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_history := jsonb_build_array(v_void_entry) || v_history;

  if v_method = 'direct' then
    update public.customers c set stamps = 10, history = v_history where c.id = p_customer_id;
  else
    update public.customers c set
      rewards_earned = c.rewards_earned + 1,
      reward_banked_at = case when c.rewards_earned = 0 then now() else c.reward_banked_at end,
      history = v_history
    where c.id = p_customer_id;
  end if;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_void_last_redemption(text, text) to anon;

drop function if exists public.staff_edit_customer(text, text, text, text);
create or replace function public.staff_edit_customer(p_token text, p_customer_id text, p_name text, p_phone text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  update public.customers c set
    name = coalesce(nullif(trim(p_name), ''), c.name),
    phone = coalesce(nullif(trim(p_phone), ''), c.phone)
  where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_edit_customer(text, text, text, text) to anon;

-- ============================================================
-- New: the actual toggle
-- ============================================================

create or replace function public.staff_set_student_status(p_token text, p_customer_id text, p_is_student boolean)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz, is_student boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.staff_from_token(p_token);
  update public.customers c set is_student = coalesce(p_is_student, false) where c.id = p_customer_id;

  return query select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = p_customer_id;
end;
$$;
grant execute on function public.staff_set_student_status(text, text, boolean) to anon;
