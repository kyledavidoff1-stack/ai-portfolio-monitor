import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Bucket colors
        bucket1: '#818CF8', // Indigo — market beta
        bucket2: '#3B82F6', // Blue — sector/factor rotation
        bucket3: '#F59E0B', // Amber — sentiment/positioning
        bucket4: '#10B981', // Green — fundamental change
        // Regime colors
        'risk-on': '#10B981',
        'risk-off': '#EF4444',
        rotation: '#3B82F6',
        dislocation: '#8B5CF6',
      },
    },
  },
  plugins: [],
};

export default config;
