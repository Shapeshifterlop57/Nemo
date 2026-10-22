-- Trang Thơ: chạy toàn bộ file này trong Supabase Dashboard > SQL Editor.
-- Chạy một lần trên dự án mới. Không chứa mật khẩu hay khóa bí mật.

create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'guest')) default 'guest',
  created_at timestamptz not null default now()
);

create table if not exists public.poems (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  category text not null default 'Thơ tự do' check (char_length(category) <= 60),
  content text not null check (char_length(content) between 1 and 20000),
  notes text not null default '' check (char_length(notes) <= 4000),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 5000),
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists poems_published_created_idx on public.poems (is_published, created_at desc);
create index if not exists poems_category_idx on public.poems (category);
create index if not exists knowledge_published_idx on public.knowledge_notes (is_published, created_at desc);

-- RLS helper. SECURITY DEFINER allows this narrowly scoped function to inspect
-- user_roles without recursive RLS evaluation. It returns only a boolean.
create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to anon, authenticated;

alter table public.user_roles enable row level security;
alter table public.poems enable row level security;
alter table public.knowledge_notes enable row level security;

-- Explicit grants. RLS alone is not enough without appropriate SQL grants.
revoke all on public.user_roles from anon, authenticated;
revoke all on public.poems from anon, authenticated;
revoke all on public.knowledge_notes from anon, authenticated;
grant select on public.user_roles to authenticated;
grant select on public.poems to anon, authenticated;
grant insert, update, delete on public.poems to authenticated;
grant select on public.knowledge_notes to anon, authenticated;
grant insert, update, delete on public.knowledge_notes to authenticated;

-- Roles can only be read by the owner of that role row or by an admin.
drop policy if exists "read own role or admin" on public.user_roles;
create policy "read own role or admin" on public.user_roles
for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_site_admin()));
-- Intentionally no client-side INSERT/UPDATE/DELETE policy on user_roles.
-- Assign the first admin using the SQL Editor only (instructions in README).

drop policy if exists "read published poems or admin" on public.poems;
create policy "read published poems or admin" on public.poems
for select to anon, authenticated
using (is_published = true or (select public.is_site_admin()));

drop policy if exists "admin inserts poems" on public.poems;
create policy "admin inserts poems" on public.poems
for insert to authenticated
with check ((select public.is_site_admin()));

drop policy if exists "admin updates poems" on public.poems;
create policy "admin updates poems" on public.poems
for update to authenticated
using ((select public.is_site_admin()))
with check ((select public.is_site_admin()));

drop policy if exists "admin deletes poems" on public.poems;
create policy "admin deletes poems" on public.poems
for delete to authenticated
using ((select public.is_site_admin()));

drop policy if exists "read published knowledge or admin" on public.knowledge_notes;
create policy "read published knowledge or admin" on public.knowledge_notes
for select to anon, authenticated
using (is_published = true or (select public.is_site_admin()));

drop policy if exists "admin inserts knowledge" on public.knowledge_notes;
create policy "admin inserts knowledge" on public.knowledge_notes
for insert to authenticated
with check ((select public.is_site_admin()));

drop policy if exists "admin updates knowledge" on public.knowledge_notes;
create policy "admin updates knowledge" on public.knowledge_notes
for update to authenticated
using ((select public.is_site_admin()))
with check ((select public.is_site_admin()));

drop policy if exists "admin deletes knowledge" on public.knowledge_notes;
create policy "admin deletes knowledge" on public.knowledge_notes
for delete to authenticated
using ((select public.is_site_admin()));

-- After creating your account through the website, copy its UUID from
-- Supabase Dashboard > Authentication > Users, then run the command in README.
