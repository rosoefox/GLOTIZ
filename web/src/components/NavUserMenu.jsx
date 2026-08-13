import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { login } from "../data/mockData";

// 모든 페이지에서 동일하게 보이는 상단 네비게이션 오른쪽 영역
// (마이페이지 | 고객지원 | 로그인/로그아웃). 마이페이지는 로그인 상태일 때만
// "나의 지원사업 현황"/"나의 정보 수정" 두 페이지로 가는 작은 팝업을 띄운다.
export default function NavUserMenu() {
  const { isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleMyPageClick = () => {
    if (!isLoggedIn) {
      window.alert(login.requiredMessage);
      navigate("/login");
      return;
    }
    setOpen((v) => !v);
  };

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate("/");
  };

  return (
    <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
      <div className="relative" ref={menuRef}>
        <button type="button" onClick={handleMyPageClick} className="hover:text-slate-900">
          마이페이지
        </button>
        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
            <Link
              to="/my-applications"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              나의 지원사업 현황
            </Link>
            <Link
              to="/mypage"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              나의 정보 수정
            </Link>
          </div>
        )}
      </div>
      <span className="text-slate-300">|</span>
      <Link to="/help" className="hover:text-slate-900">
        고객지원
      </Link>
      <span className="text-slate-300">|</span>
      {isLoggedIn ? (
        <button type="button" onClick={handleLogout} className="hover:text-slate-900">
          로그아웃
        </button>
      ) : (
        <Link to="/login" className="hover:text-slate-900">
          로그인
        </Link>
      )}
    </div>
  );
}
