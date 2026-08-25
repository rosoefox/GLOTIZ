/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f9ff",
          100: "#dcf0ff",
          200: "#b9e1fe",
          300: "#7cc8fd",
          400: "#36aafc",
          500: "#0385e3",
          600: "#026eba",
          700: "#025997",
          800: "#024474",
          900: "#012d4c",
        },
      },
      // 카드/섹션 박스의 둥근 정도를 사이트 전체에서 한 번에 낮춘다 (rounded-full은 배지/아바타/
      // 원형 버튼용이라 그대로 둔다). rounded-lg 이상을 쓰던 곳은 전부 이 값으로 좁혀진다.
      borderRadius: {
        lg: "0.375rem",
        xl: "0.375rem",
        "2xl": "0.375rem",
        "3xl": "0.5rem",
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
      },
      // 살짝 튕기는 스프링 느낌의 hover/select 트랜지션에 쓴다 (back-out 근사 곡선).
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "marquee-reverse": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
        "hero-drift": {
          "0%": { transform: "scale(1.06)", backgroundPosition: "50% 78%" },
          "100%": { transform: "scale(1.16)", backgroundPosition: "50% 30%" },
        },
        "ship-bob": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-7px)" },
        },
        "ship-cruise": {
          "0%": { transform: "translateY(14px)" },
          "35%": { transform: "translateY(-12px)" },
          "100%": { transform: "translateY(14px)" },
        },
        "wake-flow": {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "0 28px" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "10%": { opacity: "1" },
          "90%": { opacity: "1" },
          "100%": { transform: "translateY(calc(100% + 100%))", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "sketch-draw": {
          "0%, 100%": { strokeDashoffset: "1" },
          "45%, 60%": { strokeDashoffset: "0" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(28px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        marquee: "marquee 26s linear infinite",
        "marquee-reverse": "marquee-reverse 28s linear infinite",
        "hero-drift": "hero-drift 26s ease-in-out infinite alternate",
        "ship-bob": "ship-bob 4.5s ease-in-out infinite",
        "ship-cruise": "ship-cruise 4.5s cubic-bezier(0.34,0,0.2,1) infinite",
        "wake-flow": "wake-flow 1.1s linear infinite",
        "scan-line": "scan-line 2.2s ease-in-out infinite",
        shimmer: "shimmer 1.8s linear infinite",
        "fade-in-up": "fade-in-up 0.4s ease-out both",
        "sketch-draw": "sketch-draw 2.8s ease-in-out infinite",
        "slide-in-right": "slide-in-right 0.5s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};
