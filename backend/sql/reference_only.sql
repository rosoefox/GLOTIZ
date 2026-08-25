-- "참고자료"형 서식(제출 필요 없이 다운로드용으로만 올리는 파일) 지원용 컬럼.
-- 자동완성형(false/false), 사용자 제출형(user_upload_required=true), 참고자료형(reference_only=true)
-- 셋 중 하나만 해당한다.

alter table templates add column if not exists reference_only boolean not null default false;

alter table templates drop constraint if exists templates_doc_kind_check;
alter table templates add constraint templates_doc_kind_check
  check (not (user_upload_required and reference_only));
