import { useState } from "react";
import Icon from "./Icon";

// 배경(백드롭) 없이 카드 형태로 떠 있는 팝업. 헤더를 드래그해서 옮길 수 있고,
// 클릭하면 z-index만 올라가 앞으로 나올 뿐 다른 팝업을 닫지 않는다.
// 오직 X 버튼을 눌러야만 닫힌다 (배경/다른 창 클릭으로는 닫히지 않음).
let topZ = 100;

export default function Modal({ title, onClose, children, width = "max-w-md" }) {
  const [z, setZ] = useState(() => ++topZ);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const bringToFront = () => setZ(++topZ);

  const startDrag = (e) => {
    bringToFront();
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;
    const onMove = (ev) => setPos({ x: ev.clientX - startX, y: ev.clientY - startY });
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className={`fixed left-1/2 top-1/2 w-full ${width} -translate-x-1/2 -translate-y-1/2 rounded-none bg-white shadow-2xl ring-1 ring-slate-200`}
      style={{ zIndex: z, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
      onMouseDown={bringToFront}
    >
      <div
        onMouseDown={startDrag}
        className="flex cursor-move select-none items-center justify-between rounded-t-none border-b border-slate-100 px-6 py-4"
      >
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="닫기"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>
      <div className="max-h-[80vh] overflow-y-auto p-6">{children}</div>
    </div>
  );
}
