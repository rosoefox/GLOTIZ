-- Pub/Sub 기반 알림(서류 승인 / 마감임박) 추가를 위한 notifications 테이블 확장.
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

-- 1) type 체크 제약에 'approved'(서류 승인), 'deadline_soon'(마감임박) 추가.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('needs_revision', 'not_submitted', 'approved', 'deadline_soon'));

-- 2) 마감임박 알림은 특정 서류(template)가 아니라 공고(business) 단위라 business_id가 필요하다.
alter table notifications add column if not exists business_id uuid references businesses (id) on delete set null;
