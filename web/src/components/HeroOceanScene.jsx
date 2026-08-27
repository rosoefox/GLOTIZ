import { useEffect, useRef } from "react";

const bgVideo = new URL("../../home-hero-ocean-3.c091f11f.mp4", import.meta.url).href;
const shipImage = new URL("../../boat-only.png", import.meta.url).href;
const kiteImage = new URL("../../낙하산1.png", import.meta.url).href;

// boat-only.png / 낙하산1.png는 같은 1672x941 캔버스에서 잘라낸 레이어라, 서로 겹쳐 놓으면
// 카이트 로프가 배 이물에 묶인 위치가 그대로 맞는다. 아래 좌표는 그 캔버스 기준 픽셀 위치를
// 퍼센트로 옮겨 둔 것 (배경 영상과는 무관 — 배경은 그냥 정지된 바다 질감일 뿐이다).
const KITE_PIVOT = { x: 52, y: 55 }; // 로프가 이물에 묶이는 지점 — 카이트가 이 점을 축으로 흔들린다.

const SHIP_OFFSET_X = "-0.5%"; // 원래 자리에서 아주 살짝만 왼쪽으로 이동

const MAX_SWING_DEG = 10; // 좌우 스윙 최대 각도
const MAX_TILT_DEG = 6; // 상하 틸트 최대 각도
const LERP_FACTOR = 0.07; // 값이 작을수록 더 느리고 부드럽게 목표치를 따라간다

export default function HeroOceanScene() {
  const kiteRef = useRef(null);
  const targetRef = useRef({ swing: 0, tilt: 0 });
  const currentRef = useRef({ swing: 0, tilt: 0 });

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function handleMouseMove(e) {
      const nx = (e.clientX / window.innerWidth) * 2 - 1; // -1 ~ 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      targetRef.current = { swing: nx * MAX_SWING_DEG, tilt: -ny * MAX_TILT_DEG };
    }

    function applyTransform() {
      const c = currentRef.current;
      if (kiteRef.current) {
        kiteRef.current.style.transform =
          `perspective(900px) rotateX(${c.tilt.toFixed(2)}deg) rotate(${c.swing.toFixed(2)}deg)`;
      }
    }

    if (reduceMotion) {
      // 모션 최소화 설정이면 즉시 중립 상태로 두고 계속 흔들리는 루프는 만들지 않는다.
      applyTransform();
      return undefined;
    }

    window.addEventListener("mousemove", handleMouseMove);

    let rafId = requestAnimationFrame(function tick() {
      const cur = currentRef.current;
      const tgt = targetRef.current;
      cur.swing += (tgt.swing - cur.swing) * LERP_FACTOR;
      cur.tilt += (tgt.tilt - cur.tilt) * LERP_FACTOR;
      applyTransform();
      rafId = requestAnimationFrame(tick);
    });

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-[#052b45]" aria-hidden="true">
      {/* 배경: 정지된 바다 영상(카메라 이동/줌 없음) — 채도만 살짝 올려서 물 색이 더 선명하게 보이게 한다. */}
      <video
        className="absolute inset-0 h-full w-full object-cover saturate-150"
        src={bgVideo}
        autoPlay
        loop
        muted
        playsInline
      />

      {/* 배+카이트를 원래 자리에서 아주 살짝 왼쪽으로만 옮기는 고정 오프셋. */}
      <div className="absolute inset-0" style={{ transform: `translateX(${SHIP_OFFSET_X})` }}>
        {/* 배: 커서와 무관하게, 정해진 자리 안에서 스스로 앞으로 나아갔다가 제자리로 돌아오는 루프. */}
        <div className="absolute inset-0 animate-ship-cruise motion-reduce:animate-none">
          <img
            src={shipImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover saturate-150 brightness-95 contrast-105"
          />

          {/* 카이트: 마우스 위치에 lerp로 부드럽게 따라가며 스윙 + 틸트 (배와 달리 커서를 따라 움직인다) */}
          <img
            ref={kiteRef}
            src={kiteImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover will-change-transform"
            style={{ transformOrigin: `${KITE_PIVOT.x}% ${KITE_PIVOT.y}%` }}
          />
        </div>
      </div>
    </div>
  );
}
