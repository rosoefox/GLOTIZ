/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f3f6fc",
          100: "#e4ebf8",
          200: "#c9d7ef",
          300: "#a4bcdf",
          400: "#789bcb",
          500: "#557db8",
          600: "#3d63a3",
          700: "#324f84",
          800: "#2c446c",
          900: "#273a58",
        },
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
      },
      animation: {
        marquee: "marquee 26s linear infinite",
        "marquee-reverse": "marquee-reverse 28s linear infinite",
        "hero-drift": "hero-drift 26s ease-in-out infinite alternate",
        "ship-bob": "ship-bob 4.5s ease-in-out infinite",
        "ship-cruise": "ship-cruise 4.5s cubic-bezier(0.34,0,0.2,1) infinite",
        "wake-flow": "wake-flow 1.1s linear infinite",
      },
    },
  },
  plugins: [],
};
