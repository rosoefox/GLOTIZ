import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { Button } from "../components/ui";
import { brand } from "../data/mockData";

// 로그인/계정을 Cloud SQL + 자체 JWT로 옮기면서, Supabase Auth가 무료로 제공하던 "재설정
// 링크 이메일 발송"을 대체할 이메일 발송 서비스(SMTP 등)가 아직 이 프로젝트에 없다.
// 본인 확인 없이 이메일만으로 비밀번호를 바꿔주는 건 계정 탈취로 이어질 수 있는 보안
// 문제라 그렇게 구현하지 않고, 이메일 발송 인프라가 붙기 전까지는 안내만 보여준다.
export default function ResetPassword() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-amber-50 px-4">
      <Link
        to="/login"
        className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-white/60 hover:text-slate-800"
      >
        <Icon name="arrowLeft" className="w-5 h-5" />
        뒤로가기
      </Link>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src={brand.logo} alt={brand.name} className="mx-auto h-12 w-auto object-contain" />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Icon name="lock" className="mx-auto mb-4 w-5 h-5 text-slate-400" />
          <h2 className="mb-1.5 text-lg font-bold text-slate-900">비밀번호 재설정은 준비 중이에요</h2>
          <p className="mb-6 text-sm leading-relaxed text-slate-500">
            비밀번호를 잊으셨다면 담당자에게 문의해주세요. 이메일 재설정 기능은 곧 지원될 예정입니다.
          </p>
          <Link to="/login">
            <Button className="w-full py-3">로그인으로 돌아가기</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
