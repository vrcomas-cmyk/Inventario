import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        border: "rgb(var(--border) / <alpha-value>)",
        bg: "rgb(var(--bg) / <alpha-value>)",
        bgAlt: "rgb(var(--bg-alt) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        fgMuted: "rgb(var(--fg-muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        accentFg: "rgb(var(--accent-fg) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
export default config;
