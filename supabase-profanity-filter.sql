-- ============================================================
-- Eightysixdegrees Punchcard — block swear words in usernames/names
-- ============================================================
-- Run this AFTER supabase-friend-search-by-name.sql on the same
-- project: https://edunsrtcdhnpbsipalhc.supabase.co
--
-- If you already tried an earlier version of this file and got
-- "cannot change return type of existing function" / "Row type defined
-- by OUT parameters is different" — that was this file copying a stale,
-- outdated shape of signup_customer/customer_set_username/
-- customer_set_display_name (missing columns like is_student, the
-- session token, the display-name uniqueness check) instead of what's
-- actually live. This version copies the verified-current body of each
-- function exactly, with only the profanity check added on top, and
-- drops each one first — safe to run even after a partial/failed
-- previous attempt.
--
-- WHAT THIS ADDS:
--   - public.contains_profanity(text): normalizes the input (lowercase,
--     common leetspeak swapped back to letters, everything that isn't
--     a-z/0-9 stripped — so "F.U_C-K", "fu(k", and "fvck" all normalize
--     the same way as "fuck") and checks it against a fixed word list.
--   - Wired into the three places a customer actually sets a name the
--     server will accept: signup_customer (the login username, which
--     also becomes the initial display name), customer_set_username
--     (not currently called from app.js, guarded anyway since it's a
--     live RPC), and customer_set_display_name (the actual live path
--     for changing it later — also the one that doubles as the public,
--     friend-searchable name).
--   - This is server-side and authoritative on purpose: a client-side-
--     only check is trivially bypassed by anyone calling the RPC
--     directly, the same reasoning every other validation in this app
--     follows.
--
-- KNOWN LIMITATION, READ BEFORE RELYING ON THIS:
-- Substring matching on a word list can't distinguish "this word is
-- genuinely being used" from "this word happens to appear inside a
-- longer, innocent one" (the classic "Scunthorpe problem" — a town
-- name that contains a swear word; confirmed live against this exact
-- word list during testing, along with "peacock"). The list below
-- sticks to fuller words specifically to reduce that (e.g. "asshole"
-- rather than the bare "ass", which would also match "class",
-- "passion", "assign"). Two words here have a real, confirmed
-- collision: "dick" — a common given name/surname root (Dickson,
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

-- ---- signup_customer: verified-current body from
-- supabase-student-status.sql (auto-login session token, is_student,
-- 8+/upper/lower/number password rule) — only the profanity check
-- and the DROP are new here. ----
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

  if public.contains_profanity(v_username) or public.contains_profanity(v_name) then
    raise exception 'inappropriate_name';
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

-- ---- customer_set_username: verified-current body from
-- supabase-student-status.sql. Not currently called from app.js, but
-- it's a live, directly-callable RPC — guarded anyway. ----
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

  if public.contains_profanity(v_username) then
    raise exception 'inappropriate_name';
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

-- ---- customer_set_display_name: verified-current body from
-- supabase-friend-search-by-name.sql (is_student, plus the case-
-- insensitive name_taken uniqueness check now that this doubles as
-- the friend-search key) — only the profanity check is new here. ----
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

  if public.contains_profanity(v_name) then
    raise exception 'inappropriate_name';
  end if;

  select c.* into v_row from public.customers c where c.id = v_customer_id;

  if v_row.name_changed_at is not null and v_row.name_changed_at > now() - interval '14 days' then
    raise exception 'rate_limited:%', to_char(v_row.name_changed_at + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  if exists (select 1 from public.customers c where lower(trim(c.name)) = lower(v_name) and c.id <> v_customer_id) then
    raise exception 'name_taken';
  end if;

  update public.customers c set name = v_name, name_changed_at = now() where c.id = v_customer_id;

  return query
    select c.id, c.name, c.phone, c.avatar, c.stamps, c.rewards_earned, c.joined_at, c.history, c.total_stamps_earned, c.reward_banked_at, c.is_student
    from public.customers c where c.id = v_customer_id;
end;
$$;
grant execute on function public.customer_set_display_name(text, text) to anon, authenticated;
