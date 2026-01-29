#!/usr/bin/env node

/**
 * MCP Server for Chat History RAG - SSE Transport Version
 * Runs as HTTP server with Server-Sent Events (SSE) transport
 */

import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from './config.js';
import * as db from './db.js';
import { parseChatFile, extractMetadata } from './parser.js';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Define available tools
const TOOLS = [
  {
    name: 'search_chat',
    description: 'ค้นหาข้อความจาก chat history / Search messages from chat history',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'คำค้นหา / Search query',
        },
        limit: {
          type: 'number',
          description: 'จำนวนผลลัพธ์สูงสุด / Maximum results (default: 20)',
          default: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_messages_by_date',
    description: 'ดึงข้อความตามวันที่ / Get messages by date',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'วันที่ในรูปแบบ YYYY-MM-DD / Date in YYYY-MM-DD format',
        },
        limit: {
          type: 'number',
          description: 'จำนวนข้อความสูงสุด / Maximum messages (default: 100)',
          default: 100,
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'get_messages_by_sender',
    description: 'ดึงข้อความตามผู้ส่ง / Get messages by sender',
    inputSchema: {
      type: 'object',
      properties: {
        sender: {
          type: 'string',
          description: 'ชื่อผู้ส่ง / Sender name',
        },
        limit: {
          type: 'number',
          description: 'จำนวนข้อความสูงสุด / Maximum messages (default: 50)',
          default: 50,
        },
      },
      required: ['sender'],
    },
  },
  {
    name: 'get_chat_stats',
    description: 'ดูสถิติของ chat history / Get chat statistics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_recent_messages',
    description: 'ดึงข้อความล่าสุด / Get recent messages',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'จำนวนข้อความ / Number of messages (default: 20)',
          default: 20,
        },
      },
    },
  },
  {
    name: 'list_senders',
    description: 'แสดงรายชื่อผู้ส่งทั้งหมด / List all senders',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Helper: Format response
function formatResponse(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

// Helper: Format error response
function formatError(message) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: true, message }),
      },
    ],
    isError: true,
  };
}

/**
 * Create MCP server instance with tool handlers
 */
function createMCPServer() {
  const server = new Server(
    {
      name: 'chat-mcp-claude',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'search_chat': {
          const query = args?.query;
          if (!query) {
            return formatError('Query is required');
          }
          const limit = Math.min(args?.limit || 20, config.MAX_LIMIT);
          const results = db.searchMessages(query, limit);
          return formatResponse({
            query,
            count: results.length,
            messages: results,
          });
        }

        case 'get_messages_by_date': {
          const date = args?.date;
          if (!date) {
            return formatError('Date is required (format: YYYY-MM-DD)');
          }
          const limit = Math.min(args?.limit || 100, config.MAX_LIMIT);
          const messages = db.getMessagesByDate(date, limit);
          return formatResponse({
            date,
            count: messages.length,
            messages,
          });
        }

        case 'get_messages_by_sender': {
          const sender = args?.sender;
          if (!sender) {
            return formatError('Sender name is required');
          }
          const limit = Math.min(args?.limit || 50, config.MAX_LIMIT);
          const messages = db.getMessagesBySender(sender, limit);
          return formatResponse({
            sender,
            count: messages.length,
            messages,
          });
        }

        case 'get_chat_stats': {
          const stats = db.getChatStats();
          return formatResponse(stats);
        }

        case 'get_recent_messages': {
          const limit = Math.min(args?.limit || 20, config.MAX_LIMIT);
          const messages = db.getRecentMessages(limit);
          return formatResponse({
            count: messages.length,
            messages,
          });
        }

        case 'list_senders': {
          const senders = db.getSenders();
          return formatResponse({
            count: senders.length,
            senders,
          });
        }

        default:
          return formatError(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`Error in ${name}:`, error);
      return formatError(error.message);
    }
  });

  return server;
}

/**
 * Import chat files from db directory
 */
async function importChatFiles() {
  const chatDir = config.CHAT_DIR;

  if (!existsSync(chatDir)) {
    console.log(`Chat directory not found: ${chatDir}`);
    return 0;
  }

  const files = readdirSync(chatDir).filter(f => f.endsWith('.txt'));

  if (files.length === 0) {
    console.log('No chat files found in', chatDir);
    return 0;
  }

  let totalMessages = 0;

  for (const file of files) {
    const filePath = join(chatDir, file);
    console.log(`Parsing: ${file}`);

    try {
      const metadata = extractMetadata(filePath);
      console.log(`  Chat with: ${metadata.chatName}`);
      console.log(`  Saved on: ${metadata.savedOn}`);

      const messages = parseChatFile(filePath);
      console.log(`  Messages: ${messages.length}`);

      if (messages.length > 0) {
        const inserted = db.insertMessages(messages);
        totalMessages += inserted;
        console.log(`  Imported: ${inserted} messages`);
      }
    } catch (error) {
      console.log(`  Error parsing ${file}:`, error.message);
    }
  }

  return totalMessages;
}

// Store active transports for cleanup
const activeTransports = new Map();

// Create HTTP server
const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      server: 'chat-mcp-claude',
      version: '1.0.0',
      transport: 'sse',
      database: db.isDBAvailable() ? 'connected' : 'disabled',
      messages: db.getMessageCount(),
    }));
    return;
  }

  // SSE endpoint
  if (url.pathname === '/sse') {
    console.log('New SSE connection');

    const server = createMCPServer();
    const transport = new SSEServerTransport('/messages', res);

    // Store transport for potential cleanup
    const connectionId = Date.now().toString();
    activeTransports.set(connectionId, { server, transport });

    // Cleanup on close
    res.on('close', () => {
      console.log('SSE connection closed');
      activeTransports.delete(connectionId);
    });

    await server.connect(transport);
    return;
  }

  // Message endpoint for SSE
  if (url.pathname === '/messages' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        // Find the transport that should handle this message
        for (const [, { transport }] of activeTransports) {
          if (transport.handlePostMessage) {
            await transport.handlePostMessage(req, res, body);
            return;
          }
        }
        res.writeHead(404);
        res.end('No active session');
      } catch (error) {
        console.error('Error handling message:', error);
        res.writeHead(500);
        res.end('Internal error');
      }
    });
    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Not found',
    endpoints: {
      '/sse': 'SSE connection endpoint',
      '/messages': 'Message endpoint (POST)',
      '/health': 'Health check'
    }
  }));
});

// Start server
async function main() {
  // Initialize database
  await db.initDB();

  // Check if database needs import
  const messageCount = db.getMessageCount();
  if (messageCount === 0) {
    console.log('Database is empty, importing chat files...');
    const imported = await importChatFiles();
    console.log(`Total imported: ${imported} messages`);
  } else {
    console.log(`Database has ${messageCount} messages`);
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`Chat MCP Server v1.0 (SSE)`);
    console.log(`Listening on http://${HOST}:${PORT}`);
    console.log(`SSE endpoint: http://${HOST}:${PORT}/sse`);
    console.log(`Health check: http://${HOST}:${PORT}/health`);
  });
}

// Cleanup on exit
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  db.closeDB();
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  db.closeDB();
  httpServer.close();
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
