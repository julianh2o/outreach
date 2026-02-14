import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { prisma } from './db';
import apiRouter from './api';
import { getBuildPath } from './utils/paths';
import { initWebSocketServer } from './websocket';

const app = express();

app.use(cors());
app.use(express.json());

// Mount API routes
app.use('/api', apiRouter);

// Serve static files and SPA fallback for client-side routing
// This must be after all API routes
if (config.isProduction) {
  const buildPath = getBuildPath();
  console.log('[DEBUG] Build path:', buildPath);

  app.use(express.static(buildPath));

  // SPA fallback - use middleware instead of route pattern for Express 5 compatibility
  app.use(function (_req, res) {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// Create HTTP server for both Express and WebSocket
const server = createServer(app);

// Start the server
// Check for TypeScript (server/index.ts) or compiled (build/server/index.js) paths
console.log('[DEBUG] process.argv[1]:', process.argv[1]);
if (
  process.argv[1]?.includes('server/index') ||
  process.argv[1]?.includes('server/dist/index') ||
  process.argv[1]?.includes('build/index')
) {
  console.log('[DEBUG] Starting server...');
  server.listen(config.port, async () => {
    console.log(`Server running on http://localhost:${config.port}`);

    // Test database connection
    try {
      await prisma.$connect();
      console.log('Database connected successfully');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      process.exit(1);
    }

    // Initialize WebSocket server for message sync
    initWebSocketServer(server);
  });
} else {
  console.log('[DEBUG] Not starting server (condition not met)');
}

export default app;
