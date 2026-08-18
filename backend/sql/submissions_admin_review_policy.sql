-- 관리자 승인/반려(review_status 변경)를 위한 submissions UPDATE 정책
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
--
-- 관리자 페이지(AdminPage.jsx)는 서비스 롤이 아니라 로그인한 관리자의 브라우저 세션(anon key)으로
-- submissions.review_status를 직접 UPDATE한다. RLS가 켜져 있는데 이 UPDATE를 허용하는 정책이 없으면,
-- PostgREST는 에러 없이 "0행 업데이트"를 반환해서 승인/반려 버튼을 눌러도 아무 일도 일어나지 않는
-- 것처럼 보인다. 이 스크립트는 그 UPDATE를 관리자에게만 허용하는 정책을 추가한다.

alter table submissions enable row level security;

drop policy if exists "관리자 제출 상태 변경" on submissions;
create policy "관리자 제출 상태 변경" on submissions
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.account_type = 'admin'
    )
  );
