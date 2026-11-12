/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#070a0f',
          900: '#0b0e14',
          850: '#0d121d',
          800: '#121824',
          700: '#1b2333',
          600: '#283347'
        },
        brand: {
          purple: '#8b5cf6',
          blue: '#3b82f6',
          pink: '#ec4899',
          green: '#22c55e'
        }
      }
    },
  },
  plugins: [],
}
