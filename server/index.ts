import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { prisma } from './db';
import apiRouter from './api';
import { getBuildPath } from './utils/paths';
import { startDiscordBot } from './discord-bot';
import { startWorker } from './services/processingQueue';
import { initWebSocketServer } from './websocket';
import { startMessageSyncJob } from './jobs/messageSync';

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
// Check for TypeScript (server/index.ts), old compiled (server/dist/index.js), or new compiled (build/index.js) paths
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

    // Start message sync job (requests history when helper connects)
    startMessageSyncJob();

    // Start Discord bot
    await startDiscordBot();

    // Check LLM availability and start message analysis worker
    try {
      // LLM_ENDPOINT includes /v1 for OpenAI-compatible API, check /models endpoint
      const llmResponse = await fetch(`${config.messageAnalysis.llmEndpoint}/models`);
      if (llmResponse.ok) {
        console.log(
          `LLM available at ${config.messageAnalysis.llmEndpoint} (model: ${config.messageAnalysis.llmModel})`,
        );
        startWorker();
        console.log('Message analysis worker started');
      } else {
        console.warn(`LLM endpoint returned status ${llmResponse.status}. Message analysis disabled.`);
      }
    } catch {
      console.warn(`LLM endpoint not reachable at ${config.messageAnalysis.llmEndpoint}. Message analysis disabled.`);
      console.warn('Ensure LLM_ENDPOINT is set correctly (should include /v1 for OpenAI-compatible API)');
    }
  });
} else {
  console.log('[DEBUG] Not starting server (condition not met)');
}

export default app;
