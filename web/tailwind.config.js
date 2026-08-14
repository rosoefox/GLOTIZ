/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f7f6fb",
          100: "#eae6fa",
          200: "#d5caf9",
          300: "#bba9f9",
          400: "#a186fb",
          500: "#9171fb",
          600: "#8764fb",
          700: "#5e31f4",
          800: "#4215d5",
          900: "#381b98",
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
        "wake-flow": "wake-flow 1.1s linear infinite",
      },
    },
  },
  plugins: [],
};
