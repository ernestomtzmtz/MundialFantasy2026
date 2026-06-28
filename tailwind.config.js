/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#08111f",
        pitch: "#0d7d45",
        turf: "#18b764",
        trophy: "#f2b632",
        coral: "#ef5d60",
        ocean: "#1f6feb",
      },
      boxShadow: {
        glow: "0 18px 50px rgba(24, 183, 100, 0.2)",
      },
    },
  },
  plugins: [],
};
