-- ============================================================
-- Fix: three functions had a bare "phone" (and in one case "id" etc.)
-- reference that collides with their own RETURNS TABLE output column
-- names — a plpgsql-specific gotcha (SQL-language functions like
-- get_customer_by_id don't have this problem, which is why that one
-- worked fine in testing). Fixed by giving the table an alias and
-- qualifying every column reference with it. Re-running CREATE OR
-- REPLACE on these three is enough — nothing else changes.
-- ============================================================

create or replace function public.staff_list_customers(p_pin text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin is distinct from '8686' then
    raise exception 'unauthorized';
  end if;
  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history
    from public.customers c
    order by c.joined_at desc;
end;
$$;
grant execute on function public.staff_list_customers(text) to anon;

create or replace function public.signup_customer(p_username text, p_password text, p_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, is_new boolean)
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
begin
  if v_username = '' or p_password is null or length(p_password) < 6 then
    raise exception 'invalid_input';
  end if;

  select c.* into v_existing from public.customers c where lower(c.phone) = v_username limit 1;

  if found then
    if v_existing.password_hash is null or crypt(p_password, v_existing.password_hash) <> v_existing.password_hash then
      raise exception 'username_taken';
    end if;
    return query select v_existing.id, v_existing.name, v_existing.phone, v_existing.avatar,
      v_existing.stamps, v_existing.rewards_earned, v_existing.joined_at, v_existing.history, false;
    return;
  end if;

  v_new_id := 'cust_' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 9));
  v_hash := crypt(p_password, gen_salt('bf'));

  insert into public.customers (id, name, phone, avatar, stamps, rewards_earned, joined_at, history, password_hash)
  values (v_new_id, v_name, v_username, 'person', 0, 0, now(), '[]'::jsonb, v_hash);

  return query select v_new_id, v_name, v_username, 'person', 0, 0, now(), '[]'::jsonb, true;
end;
$$;
grant execute on function public.signup_customer(text, text, text) to anon;

create or replace function public.login_customer(p_username text, p_password text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.customers;
begin
  select c.* into v_row from public.customers c where lower(c.phone) = lower(trim(p_username)) limit 1;
  if not found or v_row.password_hash is null or crypt(p_password, v_row.password_hash) <> v_row.password_hash then
    return;
  end if;
  return query select v_row.id, v_row.name, v_row.phone, v_row.avatar, v_row.stamps, v_row.rewards_earned, v_row.joined_at, v_row.history;
end;
$$;
grant execute on function public.login_customer(text, text) to anon;
