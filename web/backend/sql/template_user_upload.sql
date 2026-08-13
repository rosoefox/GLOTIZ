-- 관리자가 "서식 번호 및 docx 파일을 올리지 않기"를 체크해 등록한 서류는 AI 자동완성 서식이
-- 없고, 신청자가 발급받아 직접 업로드해야 하는 서류다. 이 경우 templates.original_file_path/
-- form_number가 비어 있을 수 있으므로 NOT NULL 제약을 풀어준다.
alter table templates add column if not exists user_upload_required boolean not null default false;
alter table templates alter column original_file_path drop not null;
alter table templates alter column form_number drop not null;
