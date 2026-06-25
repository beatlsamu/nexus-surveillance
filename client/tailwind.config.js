/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'nx-bg': '#050810',
        'nx-surface': '#0a0f1e',
        'nx-cyan': '#00c8ff',
        'nx-blue': '#0066ff',
        'nx-green': '#00ff88',
        'nx-red': '#ff3366',
        'nx-text': '#e0f0ff',
        'nx-muted': '#4a7090',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        display: ['"Orbitron"', 'monospace'],
        body: ['"Exo 2"', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan': 'scan 3s linear infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'spin-slow': 'spin 8s linear infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 10px rgba(0,200,255,0.2)' },
          '100%': { boxShadow: '0 0 30px rgba(0,200,255,0.6)' },
        },
      },
    },
  },
  plugins: [],
}
