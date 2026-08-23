-- 업로드형 서식(사업자등록증/상품 상세설명서 등)을 마이페이지 서류 슬롯과 연결해서
-- "마이페이지에서 가져오기" 버튼을 지원하기 위한 컬럼.
-- Supabase 대시보드 SQL Editor에서 한 번 실행해주세요.

alter table templates add column if not exists linked_account_doc_type text;

alter table templates drop constraint if exists templates_linked_account_doc_type_check;
alter table templates add constraint templates_linked_account_doc_type_check
  check (linked_account_doc_type is null or linked_account_doc_type in ('biz_reg', 'product_spec'));
