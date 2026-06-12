import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./domain/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#FFF7E8",
        panel: "#FFFFFF",
        primary: "#A86B32",
        secondary: "#F2C879",
        ink: "#3A2A1A",
        border: "#E8D3B0",
        success: "#4F8A5B",
        danger: "#B85C5C",
        warning: "#D99A3D"
      },
      boxShadow: {
        soft: "0 16px 40px rgba(58, 42, 26, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
