import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { exampleAnalysis } from '../src/demo';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'fictional-scan-preview',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/api', (request, response) => {
          const path = request.url?.split('?')[0];
          response.setHeader('Cache-Control', 'no-store');
          request.resume();
          if (request.method === 'POST' && path === '/saved-scans/session') {
            response.writeHead(204).end();
            return;
          }
          if (request.method === 'POST' && path === '/scans') {
            // Let the user inspect the pending-state UI without making a provider request.
            const timer = setTimeout(() => {
              response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(exampleAnalysis));
            }, 12000);
            response.once('close', () => clearTimeout(timer));
            return;
          }
          if (request.method === 'GET' && path === '/saved-scans') {
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ items: [], next_before: null }));
            return;
          }
          response.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({
            detail: 'The local design preview uses the fictional PNG label and sample analysis.',
          }));
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 4186, strictPort: true },
});
