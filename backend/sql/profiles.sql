-- 회원 프로필 테이블 (auth.users 1:1 확장)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  login_id text,
  name text,
  phone text,
  company text,
  category_id text,
  country text,
  account_type text not null default 'user' check (account_type in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table profiles add column if not exists login_id text;
alter table profiles add column if not exists name text;
alter table profiles add column if not exists phone text;

alter table profiles enable row level security;

-- SQL Editor로 테이블을 만들면 Supabase가 자동으로 걸어주는 기본 권한이
-- 빠지는 경우가 있어 명시적으로 부여한다. (실제 행 접근 제한은 위 RLS 정책이 담당)
grant select, insert, update, delete on public.profiles to service_role;
grant select, update on public.profiles to authenticated;

create policy "본인 프로필 조회" on profiles
  for select using (auth.uid() = id);

create policy "본인 프로필 수정" on profiles
  for update using (auth.uid() = id);

-- 회원가입(auth.users insert) 시 signUp options.data 에 담아 보낸
-- login_id / name / phone / company / category_id / country 를 그대로 profiles 에 복사한다.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, login_id, name, phone, company, category_id, country, account_type)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'login_id',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'company',
    new.raw_user_meta_data ->> 'category_id',
    new.raw_user_meta_data ->> 'country',
    coalesce(new.raw_user_meta_data ->> 'account_type', 'user')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- 관리자 계정 지정 예시 (가입 후 수동으로 실행):
-- update profiles set account_type = 'admin' where email = 'admin@example.com';
