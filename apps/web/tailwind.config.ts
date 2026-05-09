import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'IBM Plex Sans Condensed'", "sans-serif"],
        body: ["'Fraunces'", "serif"],
      },
      colors: {
        paper: "#f5f1e8",
        ink: "#0f172a",
        signal: "#0f766e",
        ember: "#b45309",
      },
    },
  },
  plugins: [],
} satisfies Config;
