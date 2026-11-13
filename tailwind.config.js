/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        acid: {
          green: '#00ff66',
          lime: '#39ff14',
          cyan: '#00e5ff',
          neon: '#ff6b00',
        },
      },
    },
  },
  plugins: [],
}

