module.exports = {
  darkMode: 'class',
  content: [
    '../index.html',
    '../*.js',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#f2ca50',
        background: '#131315',
        'surface-container-high': '#2a2a2c',
        'surface-container-low': '#1b1b1d',
        'surface-bright': '#39393b',
        'surface-container': '#1f1f21',
        'on-surface-variant': '#d0c5af',
        surface: '#131315',
        'outline-variant': '#4d4635',
      },
      fontFamily: {
        sans: ['Assistant', 'sans-serif'],
        num: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
