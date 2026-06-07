/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'cursive'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'dark-bg': '#0a0a0f',
        'dark-surface': '#1a1a24',
        'dark-accent': '#2a2a3e',
        'neon-blue': '#00d4ff',
        'neon-purple': '#ff4fd8',
        'neon-pink': '#ff6eb4',
        'neon-orange': '#ff9f43',
        'neon-yellow': '#ffd93d',
        'neon-green': '#5fffaf',
        'neon-danger': '#ff5577',
      },
      boxShadow: {
        pixel: '4px 4px 0 black',
        'pixel-neon': '4px 4px 0 #00d4ff',
        'pixel-orange': '4px 4px 0 #ff9f43',
        'pixel-green': '4px 4px 0 #5fffaf',
        'pixel-purple': '4px 4px 0 #ff4fd8',
      },
    },
  },
  plugins: [],
}
