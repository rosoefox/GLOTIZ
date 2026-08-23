import { useEffect, useRef } from "react";

// 링크/버튼 등 클릭 가능한 요소 위에서 커서가 커지는 인터랙션을 판단하는 기준.
// React가 라우트마다 DOM을 새로 그리므로, 개별 요소에 리스너를 붙이는 대신
// document 레벨에서 이벤트 위임(mouseover/mouseout)으로 처리해 새로 생긴 요소도 바로 반응한다.
const INTERACTIVE_SELECTOR =
  'a, button, [role="button"], input, select, textarea, label, summary, .cursor-pointer';

export default function CustomCursor() {
  // 위치 추적(wrap)과 확대 애니메이션(circle)을 서로 다른 요소로 분리한다. 한 요소의
  // transform에 위치·크기를 같이 넣으면, 커지는 transition이 매 프레임 바뀌는 위치값까지
  // 같이 보간하려고 해서 커서가 마우스보다 살짝 밀리는(지연되는) 느낌이 생기기 때문이다.
  const wrapRef = useRef(null);
  const circleRef = useRef(null);

  useEffect(() => {
    // 마우스가 없는 터치 기기에서는 굳이 커서를 그리지 않는다.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const wrap = wrapRef.current;
    const circle = circleRef.current;
    if (!wrap || !circle) return;

    const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let rafId = null;

    // mousemove는 좌표만 기록하고, 실제 style.transform 갱신(위치 이동)은
    // requestAnimationFrame 콜백에서 프레임당 딱 한 번만 한다 — 마우스 폴링 레이트가
    // 화면 주사율보다 훨씬 높아도(게이밍 마우스 등) 같은 프레임에 겹치는 mousemove를
    // 한 번의 페인트로 합쳐준다. translate3d로 GPU 레이어를 명시적으로 태운다.
    const scheduleMove = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        wrap.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`;
      });
    };

    const handleMove = (e) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      scheduleMove();
    };

    const handleOver = (e) => {
      if (e.target.closest?.(INTERACTIVE_SELECTOR)) circle.classList.add("active");
    };

    const handleOut = (e) => {
      const related = e.relatedTarget;
      if (!related || !related.closest?.(INTERACTIVE_SELECTOR)) circle.classList.remove("active");
    };

    scheduleMove();
    window.addEventListener("mousemove", handleMove, { passive: true });
    document.addEventListener("mouseover", handleOver);
    document.addEventListener("mouseout", handleOut);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseover", handleOver);
      document.removeEventListener("mouseout", handleOut);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div ref={wrapRef} className="cursor-wrap" aria-hidden="true">
      <div ref={circleRef} className="cursor-circle" />
    </div>
  );
}
