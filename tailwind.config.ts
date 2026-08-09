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
        background: "#F7F1E8",
        panel: "#FFFCF7",
        primary: "#B88B58",
        secondary: "#CB9478",
        ink: "#191714",
        border: "#DDD0C1",
        success: "#16845B",
        danger: "#D92D20",
        warning: "#C9A24B",
        // Escala extraída de la referencia oficial Smellme: marfil,
        // champagne, rose-gold y bronce sobre carbón cálido.
        brand: {
          50: "#FBF7F1",
          100: "#F7EEE4",
          200: "#E8D6C3",
          300: "#E8C79E",
          400: "#D9AD82",
          500: "#CB9478",
          600: "#B88B58",
          700: "#956A3F",
          800: "#714B2D",
          900: "#4D3020",
          950: "#211E1A"
        }
      },
      boxShadow: {
        soft: "0 12px 30px rgba(25, 23, 20, 0.09)"
      }
    }
  },
  plugins: []
};

export default config;
