# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Server for chat history RAG (Retrieval-Augmented Generation) using SQLite FTS5 full-text search.

## Tech Stack

- Node.js (ES Modules)
- `@modelcontextprotocol/sdk` - MCP server framework
- `better-sqlite3` - SQLite with FTS5 support

## Commands

```bash
# Install dependencies
npm install

# Run MCP server (SSE mode on port 3001)
npm start

# Run MCP server (stdio mode)
npm run start:stdio

# Development with auto-reload
npm run dev

# Run with Docker
docker-compose up -d
```

## Project Structure

```
chat-mcp-claude/
├── db/                    # SQLite database (chat.db)
├── data/raw/              # Chat history text files (input)
├── src/
│   ├── server-sse.js     # SSE transport server (port 3001)
│   ├── index.js          # Stdio transport server
│   ├── db.js             # SQLite + FTS5 operations
│   ├── parser.js         # Chat file parser
│   └── config.js         # Configuration
├── package.json
├── Dockerfile
└── docker-compose.yml
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_chat` | Full-text search using FTS5 |
| `get_messages_by_date` | Filter by date (YYYY-MM-DD) |
| `get_messages_by_sender` | Filter by sender name |
| `get_chat_stats` | Message count, date range, top senders |
| `get_recent_messages` | Latest messages |
| `list_senders` | All unique senders |

## Endpoints (SSE Mode)

- `GET /sse` - SSE connection endpoint
- `POST /messages` - Message endpoint
- `GET /health` - Health check

## Chat File Format

The parser expects LINE/WhatsApp export format:
```
Chat history with <Name>
Saved on: M/D/YYYY, HH:MM

Day, M/D/YYYY
HH:MM<tab>Sender<tab>Message content
```

## Database

- Auto-imports chat files on first run if database is empty
- FTS5 index for Thai/English full-text search
- WAL mode for performance

## Claude Code Config

Add to `.mcp.json` or Claude Code settings:
```json
{
  "mcpServers": {
    "chat-history": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```
