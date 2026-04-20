/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        display: ["'Space Mono'", "monospace"],
      },
      colors: {
        terminal: {
          bg: "#0a0e13",
          surface: "#0f1419",
          border: "#1a2332",
          muted: "#243040",
          text: "#a8b8c8",
          dim: "#4a6080",
          green: "#00ff88",
          cyan: "#00d4ff",
          amber: "#ffaa00",
          red: "#ff4466",
          purple: "#cc88ff",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-in": "slideIn 0.2s ease-out",
        blink: "blink 1s step-end infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        slideIn: { from: { opacity: 0, transform: "translateX(-8px)" }, to: { opacity: 1, transform: "translateX(0)" } },
        blink: { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0 } },
      },
    },
  },
  plugins: [],
};
