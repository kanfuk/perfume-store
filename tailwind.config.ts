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
        background: "#FAF7F1",
        panel: "#FFFFFF",
        primary: "#9C7A45",
        secondary: "#D9C8A0",
        ink: "#231F19",
        border: "#E3D9C8",
        success: "#6B7A4F",
        danger: "#B1493F",
        warning: "#C9A24B",
        // Escala premium (marfil/bronce) usada en el admin en reemplazo del
        // "emerald" pastel heredado. Mismos 11 pasos que las escalas nativas
        // de Tailwind para que clases como bg-brand-100 / text-brand-900
        // funcionen igual que antes, solo con la nueva paleta.
        brand: {
          50: "#FAF7F1",
          100: "#F2ECE0",
          200: "#E3D9C8",
          300: "#D9C8A0",
          400: "#C4A878",
          500: "#9C7A45",
          600: "#8A6A3A",
          700: "#6B4A26",
          800: "#4A3620",
          900: "#3A2B16",
          950: "#231F19"
        }
      },
      boxShadow: {
        soft: "0 16px 40px rgba(35, 31, 25, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
