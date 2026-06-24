/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Prefer the next/font self-hosted face (--font-jakarta) and fall back to
        // the same family name / system stack, so typography is unchanged.
        sans: ["var(--font-jakarta)", "Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        primary: {
          DEFAULT: "#154212",
          container: "#2d5a27",
          "on-container": "#9dd090",
        },
        secondary: {
          DEFAULT: "#705a4c",
          container: "#f8dac8",
          "on-container": "#755e50",
        },
        harvest: "#f57c00",
        surface: {
          DEFAULT: "#fbf9f7",
          "container-lowest": "#ffffff",
          "container-low": "#f5f3f1",
          container: "#efedeb",
          "container-high": "#eae8e6",
          "container-highest": "#e4e2e0",
        },
        "on-surface": {
          DEFAULT: "#1b1c1b",
          variant: "#42493e",
        },
        outline: {
          DEFAULT: "#72796e",
          variant: "#c2c9bb",
        },
      },
    },
  },
  plugins: [],
};
