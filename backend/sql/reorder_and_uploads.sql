-- 사업/서식 순서 변경 버튼과 사용자 직접 업로드형 서류를 지원하기 위한 컬럼 추가.
-- Supabase 대시보드 SQL Editor에서 한 번 실행해주세요.

alter table businesses add column if not exists sort_order integer;
alter table templates add column if not exists sort_order integer;
alter table templates add column if not exists user_upload_required boolean not null default false;
alter table submissions add column if not exists file_path text;

-- "서식 번호 및 docx 파일을 올리지 않기" 서식은 original_file_path/form_number가 비어있을 수 있다.
-- 이미 nullable이면 아래 두 줄은 아무 효과 없이 안전하게 넘어간다.
alter table templates alter column original_file_path drop not null;
alter table templates alter column form_number drop not null;

-- 기존 행에 대해 created_at 기준으로 초기 순서를 채워준다.
-- (user_upload_required 서식이 먼저, 그다음 서식번호, 그다음 생성순)
update businesses b set sort_order = t.rn
from (select id, row_number() over (order by created_at) as rn from businesses) t
where b.id = t.id and b.sort_order is null;

update templates t set sort_order = r.rn
from (
  select id, row_number() over (
    partition by business_id
    order by user_upload_required desc nulls last, form_number nulls last, created_at
  ) as rn
  from templates
) r
where t.id = r.id and t.sort_order is null;
