import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* Graphite ink — text on the light surface */
        ink: {
          DEFAULT: "#16171B",
          soft: "#43454C",
          mute: "#71737B",
          faint: "#9C9EA6",
          line: "#E1E1DE",
        },
        /* Paper — the silver→white light surface */
        paper: {
          base: "#ECECEE",
          bright: "#FBFBFC",
          dim: "#E4E4E6",
          silver: "#D6D6DA",
          edge: "#C6C7CC",
        },
        /* Slate — the dark agent-card anchor (the one object with weight) */
        slate: {
          base: "#14151A",
          deep: "#0A0B0F",
          raise: "#1C1E25",
          line: "#2C2E36",
          text: "#ECEDEF",
          mute: "#9A9CA6",
          silver: "#C7C9D1",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: {
        editorial: "-0.03em",
        flag: "0.3em",
      },
      animation: {
        "reveal-up": "revealUp 800ms cubic-bezier(0.2, 0.8, 0, 1) both",
        ticker: "tickerScroll 38s linear infinite",
        "drift-y": "driftY 7s ease-in-out infinite",
        caret: "caretBlink 1.05s steps(1) infinite",
      },
      keyframes: {
        revealUp: {
          "0%": { opacity: "0", transform: "translateY(28px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        tickerScroll: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        driftY: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        caretBlink: {
          "0%, 50%": { opacity: "1" },
          "50.01%, 100%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
