/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f6ff',
          100: '#e0ecfe',
          200: '#c7ddfc',
          300: '#a4c8fa',
          400: '#7eaaf5',
          500: '#1a365d',
          600: '#1a3652',
          700: '#164e8a',
          800: '#153a66',
          900: '#152d4d',
        },
        secondary: {
          50: '#f0f6ff',
          100: '#ddeafb',
          200: '#c3d8f8',
          300: '#9ec2f3',
          400: '#72a6ec',
          500: '#2d5a8c',
          600: '#264d7a',
          700: '#204165',
          800: '#1a3452',
          900: '#162844',
        },
        accent: '#e74c3c',
        success: '#27ae60',
        warning: '#f39c12',
        danger: '#c0392b',
      },
    },
  },
  plugins: [],
}
