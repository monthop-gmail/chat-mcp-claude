#!/usr/bin/env node

/**
 * MCP Server for Chat History RAG
 * Provides full-text search over chat history using SQLite FTS5
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from './config.js';
import * as db from './db.js';
import { parseChatFile, extractMetadata } from './parser.js';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

// Create server instance
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

/**
 * Import chat files from db directory
 */
async function importChatFiles() {
  const chatDir = config.CHAT_DIR;

  if (!existsSync(chatDir)) {
    console.error(`Chat directory not found: ${chatDir}`);
    return 0;
  }

  const files = readdirSync(chatDir).filter(f => f.endsWith('.txt'));

  if (files.length === 0) {
    console.error('No chat files found in', chatDir);
    return 0;
  }

  let totalMessages = 0;

  for (const file of files) {
    const filePath = join(chatDir, file);
    console.error(`Parsing: ${file}`);

    try {
      const metadata = extractMetadata(filePath);
      console.error(`  Chat with: ${metadata.chatName}`);
      console.error(`  Saved on: ${metadata.savedOn}`);

      const messages = parseChatFile(filePath);
      console.error(`  Messages: ${messages.length}`);

      if (messages.length > 0) {
        const inserted = db.insertMessages(messages);
        totalMessages += inserted;
        console.error(`  Imported: ${inserted} messages`);
      }
    } catch (error) {
      console.error(`  Error parsing ${file}:`, error.message);
    }
  }

  return totalMessages;
}

// Start the server
async function main() {
  // Initialize database
  await db.initDB();

  // Check if database needs import
  const messageCount = db.getMessageCount();
  if (messageCount === 0) {
    console.error('Database is empty, importing chat files...');
    const imported = await importChatFiles();
    console.error(`Total imported: ${imported} messages`);
  } else {
    console.error(`Database has ${messageCount} messages`);
  }

  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Chat MCP Server v1.0 running on stdio');
}

// Cleanup on exit
process.on('SIGINT', async () => {
  console.error('Shutting down...');
  db.closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down...');
  db.closeDB();
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
