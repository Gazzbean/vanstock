// tailwind.config.ts
// Tells Tailwind which files to scan for CSS class names.
// If a class isn't used in these files, it gets removed from
// the final CSS bundle (keeping the app fast).

import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
