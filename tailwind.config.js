/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          decorative: '#1E8E5A',
          button: '#146B44',
          pressed: '#0F5636',
          light: '#E6F4ED',
        },
        surface: '#F7F8F9',
        'on-surface': '#1F2430',
      }
    },
  },
  plugins: [
    require('tailwindcss-rtl'),
  ],
}
