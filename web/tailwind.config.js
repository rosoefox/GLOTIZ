/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#1e3a8a",
        },
      },
      fontFamily: {
        sans: [
<<<<<<< HEAD
=======
          "Pretendard Variable",
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
      },
<<<<<<< HEAD
=======
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "marquee-reverse": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      animation: {
        marquee: "marquee 26s linear infinite",
        "marquee-reverse": "marquee-reverse 28s linear infinite",
      },
>>>>>>> 6349839 (수출 지원 페이지 화면 디자인 및 배경색 수정)
    },
  },
  plugins: [],
};
