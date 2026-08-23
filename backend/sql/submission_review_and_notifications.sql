-- 서류 제출 AI 검토 결과 컬럼 + 관리자 알림 테이블
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

create extension if not exists pgcrypto;

-- 1) submissions에 AI 검토 결과 컬럼 추가.
--    기존 status 컬럼(filled/generated)은 문서 생성(PDF) 파이프라인 상태이고,
--    review_status는 별개로 "제출 내용이 충분한가"를 판단하는 상태다.
alter table submissions add column if not exists review_status text
  not null default 'pending' check (review_status in ('pending', 'approved', 'needs_revision'));
alter table submissions add column if not exists review_note text;
alter table submissions add column if not exists reviewed_at timestamptz;

-- 2) 관리자 알림 테이블
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  submission_id uuid references submissions (id) on delete cascade,
  template_id uuid references templates (id) on delete set null,
  type text not null check (type in ('needs_revision', 'not_submitted')),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

grant select, insert, update, delete on public.notifications to service_role;
grant select, insert, update on public.notifications to authenticated;

-- 본인 알림만 조회
create policy "본인 알림 조회" on notifications
  for select using (auth.uid() = user_id);

-- 본인 알림만 읽음 처리
create policy "본인 알림 읽음 처리" on notifications
  for update using (auth.uid() = user_id);

-- 관리자만 (임의 사용자에게) 알림 생성 가능
create policy "관리자 알림 생성" on notifications
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.account_type = 'admin'
    )
  );

-- 3) submissions 테이블 실시간(Realtime) 이벤트 활성화.
--    ⚠️ 아래 문장은 idempotent 하지 않습니다 — 이미 publication에 포함돼 있으면
--    "relation ... is already member of publication" 에러가 납니다.
--    먼저 아래로 확인 후, 없는 경우에만 실행하세요:
--    select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'submissions';
alter publication supabase_realtime add table public.submissions;
