# Chat MCP Server - System Architecture

## ภาพรวมระบบ (System Overview)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Chat MCP Server Architecture                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   LINE App   │     │  WhatsApp    │     │  Other Chat  │     │   Claude     │
│              │     │              │     │    Apps      │     │    Code      │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │                    │
       │ Export             │ Export             │ Export             │ MCP
       │ (.txt)             │ (.txt)             │ (.txt)             │ Protocol
       ▼                    ▼                    ▼                    │
┌─────────────────────────────────────────────────┐                   │
│              data/raw/ (Chat Files)             │                   │
│  ┌─────────────────────────────────────────┐    │                   │
│  │ Chat history with Person A.txt          │    │                   │
│  │ Chat history with Person B.txt          │    │                   │
│  └─────────────────────────────────────────┘    │                   │
└─────────────────────┬───────────────────────────┘                   │
                      │                                               │
                      │ Parse                                         │
                      ▼                                               │
┌─────────────────────────────────────────────────┐                   │
│               parser.js (Parser)                │                   │
│  ┌─────────────────────────────────────────┐    │                   │
│  │ • parseChatFile()                       │    │                   │
│  │ • extractMetadata()                     │    │                   │
│  │ • Date pattern matching                 │    │                   │
│  │ • Message pattern matching              │    │                   │
│  └─────────────────────────────────────────┘    │                   │
└─────────────────────┬───────────────────────────┘                   │
                      │                                               │
                      │ Insert                                        │
                      ▼                                               │
┌─────────────────────────────────────────────────┐                   │
│              db.js (Database Layer)             │                   │
│  ┌─────────────────────────────────────────┐    │                   │
│  │ SQLite + FTS5 (Full-Text Search)        │    │                   │
│  │ • messages table                        │    │                   │
│  │ • messages_fts virtual table            │    │                   │
│  │ • Auto-sync triggers                    │    │                   │
│  └─────────────────────────────────────────┘    │                   │
└─────────────────────┬───────────────────────────┘                   │
                      │                                               │
                      │ Query                                         │
                      ▼                                               │
┌─────────────────────────────────────────────────┐                   │
│           server-sse.js (MCP Server)            │◄──────────────────┘
│  ┌─────────────────────────────────────────┐    │
│  │ HTTP Server (port 3001)                 │    │
│  │ • /sse - SSE connection                 │    │
│  │ • /messages - Message endpoint          │    │
│  │ • /health - Health check                │    │
│  ├─────────────────────────────────────────┤    │
│  │ MCP Tools:                              │    │
│  │ • search_chat                           │    │
│  │ • get_messages_by_date                  │    │
│  │ • get_messages_by_sender                │    │
│  │ • get_chat_stats                        │    │
│  │ • get_recent_messages                   │    │
│  │ • list_senders                          │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## Data Flow (ขั้นตอนการทำงาน)

### Phase 1: Data Import (นำเข้าข้อมูล)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 1: DATA IMPORT                              │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1                    Step 2                    Step 3
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  Chat App    │         │   Export     │         │  Copy to     │
│  (LINE/WA)   │────────▶│   to .txt    │────────▶│  data/raw/   │
└──────────────┘         └──────────────┘         └──────────────┘

Step 4                    Step 5                    Step 6
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   parser.js  │         │  Validate    │         │  Insert to   │
│   Parse file │────────▶│  & Transform │────────▶│   SQLite     │
└──────────────┘         └──────────────┘         └──────────────┘

Step 7                    Step 8
┌──────────────┐         ┌──────────────┐
│  FTS5 Index  │         │   Ready!     │
│  Auto-build  │────────▶│  Searchable  │
└──────────────┘         └──────────────┘
```

### Phase 2: Query (การค้นหา)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 2: QUERY                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1                    Step 2                    Step 3
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ Claude Code  │         │  SSE Connect │         │  Call Tool   │
│   Request    │────────▶│  /sse        │────────▶│  (MCP)       │
└──────────────┘         └──────────────┘         └──────────────┘

Step 4                    Step 5                    Step 6
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  server-sse  │         │   db.js      │         │  FTS5 Query  │
│  Route tool  │────────▶│   Function   │────────▶│  or SQL      │
└──────────────┘         └──────────────┘         └──────────────┘

Step 7                    Step 8
┌──────────────┐         ┌──────────────┐
│   Format     │         │  Response    │
│   Response   │────────▶│  to Claude   │
└──────────────┘         └──────────────┘
```

---

## File Structure (โครงสร้างไฟล์)

```
chat-mcp-claude/
│
├── data/
│   └── raw/                    # Chat text files (input)
│       ├── Chat history with Person A.txt
│       └── Chat history with Person B.txt
│
├── db/
│   └── chat.db                 # SQLite database (auto-generated)
│
├── src/
│   ├── config.js               # Configuration settings
│   ├── parser.js               # Chat file parser
│   ├── db.js                   # Database layer (SQLite + FTS5)
│   ├── server-sse.js           # MCP Server (SSE transport)
│   ├── index.js                # MCP Server (stdio transport)
│   └── import.js               # Import script
│
├── docker-compose.yml          # Docker configuration
├── Dockerfile                  # Docker build file
├── package.json                # Node.js dependencies
└── README.md                   # Documentation
```

---

## Component Details (รายละเอียดแต่ละส่วน)

### 1. Parser (parser.js)

**หน้าที่**: แปลงไฟล์ chat text เป็น structured data

```javascript
// Input: LINE/WhatsApp export format
"Chat history with มณฑป WP9"
"Saved on: 1/29/2026, 23:30"
""
"Wed, 1/29/2026"
"10:30	มณฑป WP9	สวัสดีครับ"
"10:31	p icb	สวัสดี"

// Output: Array of message objects
[
  {
    date: "2026-01-29",
    time: "10:30",
    sender: "มณฑป WP9",
    content: "สวัสดีครับ",
    chat_file: "Chat history with มณฑป WP9.txt"
  },
  ...
]
```

**Functions**:
| Function | Description |
|----------|-------------|
| `parseChatFile(path)` | Parse file → array of messages |
| `extractMetadata(path)` | Extract chat name, saved date |

---

### 2. Database Layer (db.js)

**หน้าที่**: จัดเก็บและค้นหาข้อมูล

```
┌─────────────────────────────────────────────────────────────┐
│                     SQLite Database                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 messages (table)                     │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ id       │ INTEGER PRIMARY KEY AUTOINCREMENT        │   │
│  │ date     │ TEXT (YYYY-MM-DD)                        │   │
│  │ time     │ TEXT (HH:MM)                             │   │
│  │ sender   │ TEXT                                     │   │
│  │ content  │ TEXT                                     │   │
│  │ chat_file│ TEXT                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          │ Sync (Triggers)                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              messages_fts (FTS5 Virtual Table)      │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ • Full-text search on date, sender, content         │   │
│  │ • Tokenizer: unicode61 (Thai/English support)       │   │
│  │ • Auto-sync via triggers (INSERT/UPDATE/DELETE)     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Indexes:                                                   │
│  • idx_messages_date                                        │
│  • idx_messages_sender                                      │
│  • idx_messages_chat_file                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Functions**:
| Function | Description |
|----------|-------------|
| `initDB()` | Initialize database, create tables |
| `insertMessages(messages)` | Batch insert messages |
| `searchMessages(query, limit)` | FTS5 full-text search |
| `getMessagesByDate(date, limit)` | Filter by date |
| `getMessagesBySender(sender, limit)` | Filter by sender |
| `getRecentMessages(limit)` | Get latest messages |
| `getChatStats()` | Get statistics |
| `getSenders()` | List all senders |

---

### 3. MCP Server (server-sse.js)

**หน้าที่**: Expose tools ให้ Claude Code ใช้งาน

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server (HTTP)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Endpoints:                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ GET  /sse      │ SSE connection for MCP protocol    │   │
│  │ POST /messages │ Message handler for MCP            │   │
│  │ GET  /health   │ Health check                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  MCP Tools:                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ search_chat         │ ค้นหาข้อความ (FTS5)           │   │
│  │ get_messages_by_date│ ดึงตามวันที่                   │   │
│  │ get_messages_by_sender│ ดึงตามผู้ส่ง                 │   │
│  │ get_chat_stats      │ สถิติการแชท                   │   │
│  │ get_recent_messages │ ข้อความล่าสุด                  │   │
│  │ list_senders        │ รายชื่อผู้ส่ง                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Technology Stack                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Runtime:           Node.js (ES Modules)                    │
│                                                             │
│  MCP SDK:           @modelcontextprotocol/sdk               │
│                     - Server class                          │
│                     - SSEServerTransport                    │
│                                                             │
│  Database:          SQLite (better-sqlite3)                 │
│                     - FTS5 extension                        │
│                     - WAL mode                              │
│                                                             │
│  Transport:         HTTP + Server-Sent Events (SSE)         │
│                                                             │
│  Container:         Docker + Docker Compose                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram (ลำดับการทำงาน)

### Search Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Claude  │     │  MCP     │     │  db.js   │     │  SQLite  │
│   Code   │     │  Server  │     │          │     │  + FTS5  │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │  1. Connect    │                │                │
     │ ──────────────▶│                │                │
     │     /sse       │                │                │
     │                │                │                │
     │  2. Call Tool  │                │                │
     │ ──────────────▶│                │                │
     │  search_chat   │                │                │
     │  query="ทุเรียน"│                │                │
     │                │                │                │
     │                │ 3. searchMessages()             │
     │                │───────────────▶│                │
     │                │                │                │
     │                │                │ 4. FTS5 MATCH  │
     │                │                │───────────────▶│
     │                │                │                │
     │                │                │ 5. Results     │
     │                │                │◀───────────────│
     │                │                │                │
     │                │ 6. Return      │                │
     │                │◀───────────────│                │
     │                │                │                │
     │  7. Response   │                │                │
     │◀───────────────│                │                │
     │   (JSON)       │                │                │
     │                │                │                │
```

---

## Deployment (การติดตั้ง)

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Deployment                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              docker-compose.yml                      │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                      │   │
│  │  services:                                           │   │
│  │    chat-mcp:                                         │   │
│  │      build: .                                        │   │
│  │      ports: "3001:3001"                              │   │
│  │      volumes:                                        │   │
│  │        - ./db:/app/db          # Database            │   │
│  │        - ./data/raw:/app/data/raw:ro  # Chat files  │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Commands:                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ docker compose up -d --build    # Start             │   │
│  │ docker compose logs -f          # View logs         │   │
│  │ docker compose down             # Stop              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary (สรุป)

| Step | Component | Input | Output |
|------|-----------|-------|--------|
| 1 | Chat App | Messages | .txt file |
| 2 | parser.js | .txt file | Message objects |
| 3 | db.js | Message objects | SQLite records |
| 4 | FTS5 | Records | Searchable index |
| 5 | server-sse.js | MCP request | Tool response |
| 6 | Claude Code | Tool response | Answer to user |

---

*Document Version: 1.0*
*Created: 3 ก.พ. 2026*
