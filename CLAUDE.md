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

# Run MCP server (stdio mode)
npm start

# Development with auto-reload
npm run dev

# Run with Docker
docker-compose up -d
```

## Project Structure

```
chat-mcp-claude/
├── db/                    # Chat history text files (input)
├── data/                  # SQLite database (auto-generated)
├── src/
│   ├── index.js          # MCP server, tool handlers
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

## Claude Desktop Config

Add to `~/.config/claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "chat-history": {
      "command": "node",
      "args": ["/opt/docker-test/server-mcp/chat-mcp-claude/src/index.js"]
    }
  }
}
```
