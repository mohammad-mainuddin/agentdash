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
          bg:      "rgb(var(--c-bg) / <alpha-value>)",
          surface: "rgb(var(--c-surface) / <alpha-value>)",
          border:  "rgb(var(--c-border) / <alpha-value>)",
          muted:   "rgb(var(--c-muted) / <alpha-value>)",
          text:    "rgb(var(--c-text) / <alpha-value>)",
          dim:     "rgb(var(--c-dim) / <alpha-value>)",
          green:   "rgb(var(--c-green) / <alpha-value>)",
          cyan:    "rgb(var(--c-cyan) / <alpha-value>)",
          amber:   "rgb(var(--c-amber) / <alpha-value>)",
          red:     "rgb(var(--c-red) / <alpha-value>)",
          purple:  "rgb(var(--c-purple) / <alpha-value>)",
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
