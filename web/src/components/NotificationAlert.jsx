import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import Icon from "./Icon";

// 관리자가 반려(서류 보완 필요) 처리를 하면 notifications 테이블에 행이 생기는데,
// 그동안은 그 내용을 실제로 화면에 띄워주는 곳이 없었다. 이 컴포넌트를 앱 전역(App.jsx)에
// 한 번 마운트해서, 로그인한 사용자에게 새 알림이 생길 때마다 우측 상단 토스트로 띄운다.
export default function NotificationAlert() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    if (!user?.id) {
      setToasts([]);
      return;
    }
    const channel = supabase
      .channel(`notifications-alert-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setToasts((prev) => [...prev, payload.new]);
        }
      )
      // 보완 요청 알림을 띄운 뒤 사용자가 서류를 고쳐서 다시 제출하면, 그 서류를 가리키던
      // 알림 토스트는 자동으로 치운다 — 이미 해결된 요청을 사용자가 직접 닫을 때까지 계속
      // 띄워두지 않기 위해서다. 재제출은 같은 template_id로 새 submissions 행을 만드는
      // 방식이라(기존 행을 고치는 게 아니라) INSERT를 기준으로 template_id를 맞춰 지운다.
      // review_status가 직접 바뀌는 경우(예: 관리자가 되돌리는 경우)를 대비해 UPDATE도 함께 본다.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "submissions", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setToasts((prev) => prev.filter((t) => t.template_id !== payload.new.template_id));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "submissions", filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new.review_status !== "needs_revision") {
            setToasts((prev) => prev.filter((t) => t.submission_id !== payload.new.id));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const dismiss = (toast) => {
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    supabase.from("notifications").update({ is_read: true }).eq("id", toast.id).then(
      () => {},
      () => {}
    );
  };

  const goCheck = (toast) => {
    dismiss(toast);
    navigate("/my-applications");
  };

  if (!toasts.length) return null;

  return (
    <div className="fixed right-4 top-20 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-white p-4 shadow-xl"
        >
          <Icon name="bell" className="mt-0.5 w-5 h-5 shrink-0 text-slate-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">서류 보완 요청</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{t.message}</p>
            <button
              type="button"
              onClick={() => goCheck(t)}
              className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
            >
              확인하러 가기
            </button>
          </div>
          <button
            type="button"
            onClick={() => dismiss(t)}
            aria-label="알림 닫기"
            className="shrink-0 text-slate-300 hover:text-slate-500"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>
      ))}
    </div>
  );
}
