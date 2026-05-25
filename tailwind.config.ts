import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        flux: {
          ink: "#070810",
          base: "#0D0F1C",
          raise: "#13162A",
          line: "#21253F",
          white: "#F5F5F7",
          mute: "#9CA0B8",
          faint: "#5C6180",
          lime: "#D4FF3F",
          cyan: "#4FE9E0",
          violet: "#9B8CFF",
        },
        ink: {
          deep: "#070810",
          base: "#0D0F1C",
          mute: "#13162A",
          line: "#21253F",
          ghost: "#FFFFFF0A",
        },
        bone: {
          base: "#F5F5F7",
          dim: "#C7CADA",
          mute: "#9CA0B8",
          ghost: "#FFFFFF24",
        },
        sienna: {
          DEFAULT: "#D4FF3F",
          deep: "#B6E02A",
          glow: "#D4FF3F55",
          dim: "#D4FF3F14",
        },
        gold: {
          DEFAULT: "#9B8CFF",
          deep: "#7C6BFF",
        },
        celo: {
          yellow: "#FCFF52",
          forest: "#476520",
          black: "#000000",
          cream: "#FCF6F1",
        },
        envoy: {
          ink: "#0A0E1A",
          fog: "#F4F4F0",
          accent: "#35D07F",
        },
        paper: {
          base: "#FCF6F1",
          tint: "#F0E9DD",
          shadow: "#E5DDD0",
          stain: "#1B1814",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: {
        editorial: "-0.025em",
        flag: "0.32em",
      },
      animation: {
        "reveal-up": "revealUp 800ms cubic-bezier(0.2, 0.8, 0, 1) both",
        "reveal-fade": "revealFade 900ms ease-out both",
        "draw-line": "drawLine 1200ms cubic-bezier(0.6, 0, 0.2, 1) both",
        "draw-underline": "drawUnderline 700ms cubic-bezier(0.6, 0, 0.2, 1) both",
        ticker: "tickerScroll 38s linear infinite",
        blip: "blip 1.6s ease-in-out infinite",
        "soft-spin": "softSpin 28s linear infinite",
        "soft-spin-rev": "softSpinReverse 38s linear infinite",
        beat: "beat 1800ms cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "drift-y": "driftY 7s ease-in-out infinite",
      },
      keyframes: {
        revealUp: {
          "0%": { opacity: "0", transform: "translateY(28px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        revealFade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        drawLine: {
          "0%": { strokeDashoffset: "100%" },
          "100%": { strokeDashoffset: "0" },
        },
        drawUnderline: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        tickerScroll: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        blip: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.85)" },
        },
        softSpin: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        softSpinReverse: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(-360deg)" },
        },
        beat: {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "40%": { transform: "scale(1.06)", opacity: "0.92" },
          "70%": { transform: "scale(0.98)" },
        },
        driftY: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
