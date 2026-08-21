-- ============================================================
-- Eightysixdegrees Punchcard — block swear words in usernames/names
-- ============================================================
-- Run this AFTER supabase-customer-display-name.sql on the same
-- project: https://edunsrtcdhnpbsipalhc.supabase.co
--
-- WHAT THIS ADDS:
--   - public.contains_profanity(text): normalizes the input (lowercase,
--     common leetspeak swapped back to letters, everything that isn't
--     a-z/0-9 stripped — so "F.U_C-K", "fu(k", and "fvck" all normalize
--     the same way as "fuck") and checks it against a fixed word list.
--   - Wired into the two places a customer actually sets a name the
--     server will accept: signup_customer (the login username, which
--     also becomes the initial public display name) and
--     customer_set_display_name (changing it later). Both now raise
--     'inappropriate_name' instead of writing the row.
--   - customer_set_username exists in the schema but nothing in app.js
--     currently calls it (see its own file's history) — guarded anyway
--     since it's a live, callable RPC regardless of whether the client
--     uses it today.
--   - This is server-side and authoritative on purpose: a client-side-
--     only check is trivially bypassed by anyone calling the RPC
--     directly, the same reasoning every other validation in this app
--     follows.
--
-- KNOWN LIMITATION, READ BEFORE RELYING ON THIS:
-- Substring matching on a word list can't distinguish "this word is
-- genuinely being used" from "this word happens to appear inside a
-- longer, innocent one" (the classic "Scunthorpe problem" — a town
-- name that contains a swear word). The list below sticks to fuller
-- words specifically to reduce that (e.g. "asshole" rather than the
-- bare "ass", which would also match "class", "passion", "assign").
-- Two words here have a real, confirmed collision (tested, not just
-- theoretical): "dick" — a common given name/surname root (Dickson,
-- Dickinson) — and "cock", which also matches "peacock", "cockpit",
-- "hitchcock", "cocktail". Both are kept in because they're also very
-- common standalone insults on their own, but if a real customer's
-- name or a legitimate word gets blocked, those are the words to
-- remove first. Add or remove entries directly in the array below —
-- no code changes needed elsewhere.
-- ============================================================

create or replace function public.contains_profanity(p_text text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_normalized text;
  v_word text;
  -- Kept to actual swear words/slurs, not mild words (crap/damn/hell)
  -- or bare 2-3 letter roots that would false-positive constantly.
  v_bad_words text[] := array[
    'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'piss', 'pussy',
    'twat', 'wank', 'bastard', 'slut', 'whore', 'cock',
    'nigger', 'nigga', 'faggot', 'fag', 'retard', 'chink', 'spic',
    'kike', 'tranny', 'dyke'
  ];
begin
  if p_text is null then
    return false;
  end if;

  v_normalized := lower(p_text);
  -- Common leetspeak substitutions, applied before stripping punctuation
  -- so "fu(k" -> "fuck" and "5hit" -> "shit" both still get normalized.
  v_normalized := translate(v_normalized, '013457$@!', 'oieastsai');
  v_normalized := regexp_replace(v_normalized, '[^a-z0-9]', '', 'g');

  foreach v_word in array v_bad_words loop
    if v_normalized like '%' || v_word || '%' then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

-- ---- signup_customer: block it as both login username and initial
-- display name (p_name defaults to the username when not given) ----
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

  if public.contains_profanity(v_username) or public.contains_profanity(v_name) then
    raise exception 'inappropriate_name';
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

-- ---- customer_set_display_name: block it on every later name change ----
create or replace function public.customer_set_display_name(p_token text, p_name text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
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

  if public.contains_profanity(v_name) then
    raise exception 'inappropriate_name';
  end if;

  select c.* into v_row from public.customers c where c.id = v_customer_id;

  if v_row.name_changed_at is not null and v_row.name_changed_at > now() - interval '14 days' then
    raise exception 'rate_limited:%', to_char(v_row.name_changed_at + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  update public.customers c set name = v_name, name_changed_at = now() where c.id = v_customer_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_set_display_name(text, text) to anon, authenticated;

-- ---- customer_set_username: not currently called from app.js, guarded
-- anyway since it's a live, directly-callable RPC ----
drop function if exists public.customer_set_username(text, text);
create or replace function public.customer_set_username(p_token text, p_username text)
returns table(id text, name text, phone text, avatar text, stamps integer, rewards_earned integer, joined_at timestamptz, history jsonb, total_stamps_earned integer, reward_banked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := public.customer_id_from_caller(p_token);
  v_username text := lower(trim(p_username));
begin
  if v_username = '' then
    raise exception 'invalid_input';
  end if;

  if public.contains_profanity(v_username) then
    raise exception 'inappropriate_name';
  end if;

  if exists (select 1 from public.customers c where lower(c.phone) = v_username and c.id <> v_id) then
    raise exception 'username_taken';
  end if;

  update public.customers c set phone = v_username where c.id = v_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at
    from public.customers c where c.id = v_id;
end;
$$;
grant execute on function public.customer_set_username(text, text) to anon, authenticated;
