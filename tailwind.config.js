/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1D4ED8',
        primaryDark: '#1E3A8A',
        accent: '#F5F1E6',
        danger: '#B91C1C',
        warning: '#D97706',
        success: '#15803D',
      },
      boxShadow: {
        soft: '0 12px 36px rgba(30, 58, 138, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
