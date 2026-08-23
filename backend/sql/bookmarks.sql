-- 지원사업 북마크(찜) 테이블
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

create extension if not exists pgcrypto;

create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, business_id)
);

alter table bookmarks enable row level security;

grant select, insert, update, delete on public.bookmarks to service_role;
grant select, insert, delete on public.bookmarks to authenticated;

-- 본인 북마크만 조회/추가/삭제
create policy "본인 북마크 조회" on bookmarks
  for select using (auth.uid() = user_id);

create policy "본인 북마크 추가" on bookmarks
  for insert with check (auth.uid() = user_id);

create policy "본인 북마크 삭제" on bookmarks
  for delete using (auth.uid() = user_id);
