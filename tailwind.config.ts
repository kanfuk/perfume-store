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
        background: "#F7F8FA",
        panel: "#FFFFFF",
        primary: "#7357FF",
        secondary: "#6E8BFF",
        ink: "#111318",
        border: "#E4E7EC",
        success: "#16845B",
        danger: "#D92D20",
        warning: "#C9A24B",
        // Escala premium (marfil/bronce) usada en el admin en reemplazo del
        // "emerald" pastel heredado. Mismos 11 pasos que las escalas nativas
        // de Tailwind para que clases como bg-brand-100 / text-brand-900
        // funcionen igual que antes, solo con la nueva paleta.
        brand: {
          50: "#F5F3FF",
          100: "#EEEBFF",
          200: "#DCD6FF",
          300: "#C1B6FF",
          400: "#9B88FF",
          500: "#7357FF",
          600: "#6547FA",
          700: "#5434E6",
          800: "#452BB8",
          900: "#392694",
          950: "#20145D"
        }
      },
      boxShadow: {
        soft: "0 8px 24px rgba(17, 19, 24, 0.07)"
      }
    }
  },
  plugins: []
};

export default config;
