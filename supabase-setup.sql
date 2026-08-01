-- ============================================================
-- Smile Numbered — Supabase setup
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste all of this → Run)
-- ============================================================

-- ---------- profiles ----------
-- One row per signed-up user, linked 1:1 to Supabase's built-in auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  is_admin boolean not null default false,
  is_disabled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- helper: is the currently logged-in user an admin?
create or replace function public.is_requester_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- users can see their own profile; admins can see everyone's
create policy "profiles_select" on public.profiles
  for select using (
    auth.uid() = id or public.is_requester_admin()
  );

-- users can update their own row; admins can update any row.
-- a trigger below still blocks non-admins from granting themselves admin/enabled status.
create policy "profiles_update" on public.profiles
  for update using (
    auth.uid() = id or public.is_requester_admin()
  );

-- prevent a non-admin from setting is_admin / is_disabled on any row (incl. their own)
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_requester_admin() then
    new.is_admin := old.is_admin;
    new.is_disabled := old.is_disabled;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- auto-create a profile row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.email);
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- invoices ----------
-- one row per "batch" saved from the app (thumbnail + metadata, not the full files)
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Invoice batch',
  count integer not null default 0,
  format text not null default 'png',
  thumb text,
  created_at timestamptz not null default now()
);

alter table public.invoices enable row level security;

create policy "invoices_select" on public.invoices
  for select using (
    auth.uid() = user_id or public.is_requester_admin()
  );

create policy "invoices_insert" on public.invoices
  for insert with check (auth.uid() = user_id);

create policy "invoices_delete" on public.invoices
  for delete using (
    auth.uid() = user_id or public.is_requester_admin()
  );

-- ============================================================
-- After running this, sign up in the app once as yourself, then
-- run this (with your own email) to make that account an admin:
--
--   update public.profiles set is_admin = true where email = 'you@example.com';
-- ============================================================
