import type { Config } from "tailwindcss";

/**
 * Brand design tokens for KSMVP VA Tasks.
 * Colors are anchored to the four brand bases; tints/shades are derived
 * for hover / active / disabled / focus states. Do not introduce off-brand hues.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          // Primary structure — nav, headers, primary buttons, links, table headers
          blue: {
            DEFAULT: "#303E7A",
            50: "#eef0f7",
            100: "#d5daeb",
            200: "#aab5d6",
            300: "#7f8fc2",
            400: "#556aad",
            500: "#3d4f95",
            600: "#303E7A", // base
            700: "#293568",
            800: "#212a53",
            900: "#191f3e",
          },
          // Action & momentum — Time In / Time Out buttons, urgent treatment
          orange: {
            DEFAULT: "#F67F25",
            50: "#fef3ea",
            100: "#fde0c9",
            200: "#fbc296",
            300: "#f9a35f",
            400: "#f79040",
            500: "#F67F25", // base
            600: "#e06a11",
            700: "#b9560e",
            800: "#93450c",
            900: "#78390b",
          },
          // Highlights & benchmark markers — on-time accents, subtle callouts
          yellow: {
            DEFAULT: "#FBCE1B",
            50: "#fffae6",
            100: "#fef1b8",
            200: "#fde785",
            300: "#fcdc52",
            400: "#FBCE1B", // base
            500: "#e2b711",
            600: "#bd950d",
            700: "#97720c",
            800: "#7a5b0d",
            900: "#664c0e",
          },
          black: "#000000",
        },
      },
      fontFamily: {
        // Poppins — headings, buttons, logo lockup, big numbers
        heading: ["var(--font-poppins)", "system-ui", "sans-serif"],
        // Open Sans — body text, labels, table cells, form fields
        sans: ["var(--font-open-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(16, 24, 40, 0.08), 0 1px 2px rgba(16, 24, 40, 0.06)",
        "card-hover": "0 4px 12px rgba(16, 24, 40, 0.10), 0 2px 4px rgba(16, 24, 40, 0.06)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "scale-in": "scale-in 180ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
