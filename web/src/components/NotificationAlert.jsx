import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import Icon from "./Icon";

// Cloud SQL엔 Supabase Realtime 같은 실시간 구독이 없어서, 짧은 주기로 다시 불러오는
// 폴링으로 "관리자가 반려하면 바로 토스트로 뜬다"는 동작을 대체한다.
const POLL_INTERVAL_MS = 10000;

// 관리자가 반려(서류 보완 필요) 처리를 하면 notifications 테이블에 행이 생기는데,
// 그동안은 그 내용을 실제로 화면에 띄워주는 곳이 없었다. 이 컴포넌트를 앱 전역(App.jsx)에
// 한 번 마운트해서, 로그인한 사용자에게 새 알림이 생길 때마다 우측 상단 토스트로 띄운다.
export default function NotificationAlert() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  // poll()은 effect가 재실행될 때만 새로 만들어지는 클로저라, 그 안에서 매번 최신 toasts를
  // 보려면(그리고 setState 업데이터를 순수하게 유지하려면) 상태와 별개로 ref로도 미러링해둔다.
  const toastsRef = useRef([]);
  // 페이지에 들어오기 "전부터" 있던 알림은 토스트로 안 띄운다(기존 Realtime의 INSERT-only 동작과
  // 동일) - 첫 폴링에서 이미 있던 알림 id를 여기 미리 채워두고, 그 이후에 새로 보이는 것만 띄운다.
  const seenIdsRef = useRef(null);

  useEffect(() => {
    if (!user?.id) {
      toastsRef.current = [];
      setToasts([]);
      seenIdsRef.current = null;
      return;
    }
    let cancelled = false;

    async function poll() {
      const [{ notifications } = { notifications: [] }, { submissions } = { submissions: [] }] = await Promise.all([
        api.get("/notifications?is_read=false", session?.access_token).catch(() => ({ notifications: [] })),
        api.get("/submissions", session?.access_token).catch(() => ({ submissions: [] })),
      ]);
      if (cancelled) return;

      // 서류를 고쳐서 재제출했거나(같은 template_id로 새 submission 생성) 관리자가 승인/보류를
      // 되돌린 경우엔, 그 서류를 가리키던 알림 토스트를 자동으로 치운다.
      const latestByTemplate = {};
      (submissions || []).forEach((s) => {
        const cur = latestByTemplate[s.template_id];
        if (!cur || new Date(s.created_at) > new Date(cur.created_at)) latestByTemplate[s.template_id] = s;
      });

      if (seenIdsRef.current === null) {
        // 첫 폴링: 지금 있는 알림은 이미 지나간 것으로 치고 조용히 기억만 해둔다.
        seenIdsRef.current = new Set((notifications || []).map((n) => n.id));
        return;
      }

      // setState 업데이터 함수는 순수해야 한다(React StrictMode가 개발 모드에서 검증차 두 번
      // 호출한다) - seenIdsRef 변경 같은 부수효과를 업데이터 "안"에 두면, 두 번째 호출 때는 이미
      // 첫 번째 호출이 seenIdsRef를 바꿔놔서 "새 알림"이 아무것도 안 남아 빈 배열이 되고, React는
      // 그 마지막 호출 결과를 그대로 커밋해버려 토스트가 영영 안 뜬다. 그래서 fresh 계산과
      // seenIdsRef 변경은 업데이터 밖에서 미리 끝내고, setToasts에는 순수한 값만 넘긴다.
      const prevToasts = toastsRef.current;
      const kept = prevToasts.filter((t) => {
        const latest = latestByTemplate[t.template_id];
        return latest && latest.id === t.submission_id && latest.review_status === "needs_revision";
      });
      const keptIds = new Set(kept.map((t) => t.id));
      const fresh = (notifications || []).filter(
        (n) => n.type === "needs_revision" && !keptIds.has(n.id) && !seenIdsRef.current.has(n.id)
      );
      fresh.forEach((n) => seenIdsRef.current.add(n.id));
      const next = [...kept, ...fresh];
      toastsRef.current = next;
      setToasts(next);
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.id, session?.access_token]);

  const dismiss = (toast) => {
    const next = toastsRef.current.filter((t) => t.id !== toast.id);
    toastsRef.current = next;
    setToasts(next);
    api.patch(`/notifications/${toast.id}/read`, undefined, session?.access_token).catch(() => {});
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
          className="flex items-start gap-3 rounded-none border border-red-200 bg-white p-4 shadow-xl"
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
