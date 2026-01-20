import type { Server as HTTPServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { handleConnection } from './messagesSyncHandler';

let wss: WebSocketServer | null = null;

/**
 * Initialize the WebSocket server
 */
export function initWebSocketServer(server: HTTPServer): WebSocketServer {
  wss = new WebSocketServer({
    noServer: true,
    maxPayload: 50 * 1024 * 1024, // 50MB max message size
  });

  // Handle upgrade requests manually to route by path
  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

    if (pathname === '/messages-sync') {
      wss!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        wss!.emit('connection', ws, request);
      });
    } else {
      // Reject connections to other paths
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    handleConnection(ws);
  });

  console.log('WebSocket server initialized on /messages-sync');

  return wss;
}

/**
 * Get the WebSocket server instance
 */
export function getWebSocketServer(): WebSocketServer | null {
  return wss;
}

// Re-export connection utilities
export {
  isHelperConnected,
  getHelperConnection,
  requestSendMessage,
  requestHistorySince,
  requestHistoryBefore,
  requestLatestHistory,
  startHistorySync,
  isHistorySyncInProgress,
  onHistorySyncComplete,
  onHelperConnected,
  onHelperDisconnected,
} from './messagesSyncHandler';
