module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      // Tailwind's smallest built-in breakpoint (sm) is 640px — everything
      // below that is just "base", which spans the entire phone range
      // (320-430px+). This one extra tier lets the card grid distinguish
      // the smallest phones (2 columns) from standard ones (3) within that
      // range; sm/md/lg/xl/2xl above it are all stock Tailwind values.
      screens: {
        xs: '360px',
      },
      colors: {
        'white': {
          DEFAULT: '#edf1f5',
          100: '#ffffff',
        },
        'blue': '#3db4f2',
        'purple': '#b368e6',
        'green': '#4abd4e',
        'orange': '#ef881a',
        'red': '#e13333',
        'pink': '#e85fb2',
        'gray': '#677b94',
      },
    },
  },
  plugins: [],
}
