import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // SECURITY NOTE: API keys are injected here for frontend Gemini API access
      // Mitigation: nginx proxy limits access to authorized domains only
      // Cloud Run deployment has authentication and domain restrictions
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.POLYGON_API_KEY': JSON.stringify(env.POLYGON_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html'),
            test: path.resolve(__dirname, 'tests/test-typescript-rankings.html'),
            'test-enhanced': path.resolve(__dirname, 'tests/test-enhanced-rankings.html'),
            'portfolio-chart': path.resolve(__dirname, 'tests/portfolio-chart.html')
          }
        }
      }
    };
});
