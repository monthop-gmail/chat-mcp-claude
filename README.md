# Chat History MCP Server

MCP (Model Context Protocol) Server สำหรับค้นหา Chat History ด้วย SQLite FTS5 Full-text Search

## Features

- Full-text Search (FTS5) รองรับภาษาไทย/อังกฤษ
- ค้นหาตามวันที่, ผู้ส่ง
- แสดงสถิติการแชท
- รองรับ LINE/WhatsApp export format

## Tools

| Tool | Description |
|------|-------------|
| `search_chat` | ค้นหาข้อความ (FTS5) |
| `get_messages_by_date` | ค้นหาตามวันที่ (YYYY-MM-DD) |
| `get_messages_by_sender` | ค้นหาตามผู้ส่ง |
| `get_chat_stats` | สถิติการแชท |
| `get_recent_messages` | ข้อความล่าสุด |
| `list_senders` | รายชื่อผู้ส่งทั้งหมด |

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/monthop-gmail/chat-mcp-claude.git
cd chat-mcp-claude
```

### 2. Add Chat Files

วางไฟล์ chat export ไว้ใน `data/raw/` folder (LINE/WhatsApp format)

### 3. Start with Docker Compose

```bash
docker compose up -d --build
```

### 4. Verify

```bash
# Check status
docker compose ps

# Test health
curl http://localhost:3001/health

# View logs
docker logs -f chat-mcp-claude
```

## Add to Claude Code

```bash
# Add MCP server
claude mcp add --transport sse --scope user chat-history http://localhost:3001/sse

# Verify connection
claude mcp list

# Remove (if needed)
claude mcp remove chat-history
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `http://localhost:3001/sse` | SSE connection for MCP |
| `http://localhost:3001/health` | Health check |

## Chat File Format

รองรับ LINE/WhatsApp export format:

```
Chat history with <Name>
Saved on: M/D/YYYY, HH:MM

Day, M/D/YYYY
HH:MM	Sender	Message content
```

## License

MIT
