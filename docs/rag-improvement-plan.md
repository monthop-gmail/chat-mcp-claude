# RAG Improvement Plan

> แผนปรับปรุง Retrieval-Augmented Generation สำหรับ Chat MCP Server

---

## สถานะปัจจุบัน

| ส่วน | เทคโนโลยี | สถานะ |
|------|-----------|--------|
| Retrieval | FTS5 Full-text Search | ✅ ใช้งานได้ |
| Storage | SQLite + Indexes | ✅ ใช้งานได้ |
| Tokenizer | unicode61 | ✅ รองรับ Thai/English |
| Ranking | BM25 (FTS5 default) | ✅ พื้นฐาน |

---

## จุดที่ควรปรับปรุง

### 1. Context Window (ความยาก: ง่าย)

**ปัญหา**: Return แค่ message ที่ match โดยไม่มี context

**ปัจจุบัน**:
```json
{
  "content": "นัดประชุมวันพรุ่งนี้"
}
```

**ปรับปรุง**:
```json
{
  "content": "นัดประชุมวันพรุ่งนี้",
  "context_before": [
    { "time": "10:28", "sender": "A", "content": "เรื่องงาน ทร." }
  ],
  "context_after": [
    { "time": "10:32", "sender": "B", "content": "ได้ครับ 10 โมง" }
  ]
}
```

**วิธีทำ**:
- เพิ่ม parameter `context_size` (default: 3)
- Query messages ก่อน/หลัง match โดยใช้ date + time

**ไฟล์ที่ต้องแก้**: `src/db.js`

---

### 2. Recency Boost (ความยาก: ง่าย)

**ปัญหา**: ข้อความเก่าและใหม่มี weight เท่ากัน

**ปรับปรุง**:
```sql
-- เพิ่ม recency score
SELECT *,
  (1.0 / (julianday('now') - julianday(date) + 1)) as recency_score
FROM messages
WHERE ...
ORDER BY (rank * 0.7) + (recency_score * 0.3) DESC
```

**วิธีทำ**:
- เพิ่ม recency factor ใน search query
- ให้ user กำหนด weight ได้ (default: 0.3)

**ไฟล์ที่ต้องแก้**: `src/db.js` (searchMessages function)

---

### 3. Thai Word Segmentation (ความยาก: กลาง)

**ปัญหา**: FTS5 tokenize ภาษาไทยไม่ดี

**ตัวอย่าง**:
```
"สวัสดีครับ" → ค้นหา "สวัสดี" ไม่เจอ
"ประชุม" → ค้นหา "ประชุมงาน" ไม่เจอ
```

**ปรับปรุง**:
- ใช้ Thai word segmentation library
- Pre-process content ก่อน insert
- เก็บ tokenized version แยก column

**Libraries**:
- `thai-tokenizer` (npm)
- `pythainlp` (Python - ใช้ผ่าน child process)
- `deepcut` (Python)

**วิธีทำ**:
1. เพิ่ม column `content_tokenized`
2. Tokenize ก่อน insert
3. Search บน tokenized column

**ไฟล์ที่ต้องแก้**:
- `src/parser.js` (เพิ่ม tokenize step)
- `src/db.js` (เพิ่ม column, แก้ search)

---

### 4. Semantic Search (ความยาก: ยาก)

**ปัญหา**: Keyword matching ไม่เข้าใจความหมาย

**ตัวอย่าง**:
```
ค้นหา "อาหาร" → ไม่เจอ "ข้าว", "กับข้าว", "ร้านอาหาร"
ค้นหา "นัดประชุม" → ไม่เจอ "meeting", "call"
```

**ปรับปรุง**:
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Message    │────▶│  Embedding   │────▶│   Vector     │
│   Content    │     │    Model     │     │   Database   │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
┌──────────────┐     ┌──────────────┐            │
│    Query     │────▶│  Embedding   │────────────┘
│              │     │    Model     │     Similarity Search
└──────────────┘     └──────────────┘
```

**Options**:

| Model | ข้อดี | ข้อเสีย |
|-------|-------|---------|
| OpenAI text-embedding-3-small | คุณภาพดี, รองรับไทย | ต้องจ่ายเงิน, ต้อง internet |
| Cohere embed-multilingual | รองรับไทยดี | ต้องจ่ายเงิน |
| sentence-transformers (local) | ฟรี, offline | ต้อง GPU, ช้ากว่า |
| Ollama + nomic-embed | ฟรี, offline | ต้อง setup |

**Vector Database Options**:
- SQLite + sqlite-vss (extension)
- Chroma (embedded)
- Qdrant (docker)
- Pinecone (cloud)

**วิธีทำ**:
1. เลือก embedding model
2. เลือก vector database
3. สร้าง embeddings สำหรับ messages ทั้งหมด
4. Query โดยใช้ cosine similarity

**ไฟล์ที่ต้องเพิ่ม**:
- `src/embeddings.js` (embedding functions)
- `src/vector-db.js` (vector database layer)

---

### 5. Hybrid Search (ความยาก: ยาก)

**ปัญหา**: Semantic search อย่างเดียวอาจพลาด exact match

**ปรับปรุง**: รวม FTS5 + Semantic Search

```
┌─────────────────────────────────────────────────────────┐
│                    Hybrid Search                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Query: "นัดประชุมงาน ทร."                               │
│                                                         │
│  ┌─────────────┐           ┌─────────────┐             │
│  │   FTS5      │           │  Semantic   │             │
│  │   Search    │           │   Search    │             │
│  └──────┬──────┘           └──────┬──────┘             │
│         │                         │                     │
│         │ Results A               │ Results B           │
│         │                         │                     │
│         └────────────┬────────────┘                     │
│                      │                                  │
│                      ▼                                  │
│              ┌─────────────┐                           │
│              │   Merge &   │                           │
│              │  Re-rank    │                           │
│              └──────┬──────┘                           │
│                     │                                   │
│                     ▼                                   │
│              Final Results                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Merge Strategy**:
```javascript
// Reciprocal Rank Fusion (RRF)
function rrf(ftsResults, semanticResults, k = 60) {
  const scores = new Map();

  ftsResults.forEach((id, rank) => {
    scores.set(id, (scores.get(id) || 0) + 1 / (k + rank));
  });

  semanticResults.forEach((id, rank) => {
    scores.set(id, (scores.get(id) || 0) + 1 / (k + rank));
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}
```

---

### 6. Query Enhancement (ความยาก: กลาง)

**ปัญหา**: User อาจค้นหาด้วยคำไม่ตรง

**ปรับปรุง**:

#### 6.1 Query Expansion
```javascript
// ขยายคำค้น
function expandQuery(query) {
  const synonyms = {
    'ประชุม': ['meeting', 'call', 'นัด'],
    'งาน': ['project', 'โปรเจค', 'work'],
    'เงิน': ['เบิก', 'โอน', 'จ่าย', 'บาท'],
  };

  let expanded = query;
  for (const [word, syns] of Object.entries(synonyms)) {
    if (query.includes(word)) {
      expanded += ' ' + syns.join(' ');
    }
  }
  return expanded;
}
```

#### 6.2 Typo Tolerance
```javascript
// ใช้ Levenshtein distance
function fuzzyMatch(query, content, maxDistance = 2) {
  // ...
}
```

---

### 7. Caching (ความยาก: ง่าย)

**ปัญหา**: Query ซ้ำๆ ต้อง search ใหม่ทุกครั้ง

**ปรับปรุง**:
```javascript
import { LRUCache } from 'lru-cache';

const searchCache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 5, // 5 minutes
});

function searchMessages(query, limit) {
  const cacheKey = `${query}:${limit}`;

  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey);
  }

  const results = doSearch(query, limit);
  searchCache.set(cacheKey, results);
  return results;
}
```

---

## Roadmap

| Phase | เรื่อง | Timeline | Priority |
|-------|--------|----------|----------|
| 1 | Context Window | Week 1 | High |
| 1 | Recency Boost | Week 1 | Medium |
| 1 | Caching | Week 1 | Medium |
| 2 | Thai Word Segmentation | Week 2-3 | High |
| 2 | Query Enhancement | Week 2-3 | Medium |
| 3 | Semantic Search | Week 4-6 | High |
| 3 | Hybrid Search | Week 6-8 | High |

---

## Resources

### Libraries
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [sqlite-vss](https://github.com/asg017/sqlite-vss) - Vector search for SQLite
- [lru-cache](https://github.com/isaacs/node-lru-cache)
- [thai-tokenizer](https://www.npmjs.com/package/thai-tokenizer)

### Embedding Models
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [Cohere Embed](https://docs.cohere.com/docs/embeddings)
- [Sentence Transformers](https://www.sbert.net/)
- [Ollama](https://ollama.ai/)

### References
- [FTS5 Documentation](https://www.sqlite.org/fts5.html)
- [Reciprocal Rank Fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- [Hybrid Search Patterns](https://www.pinecone.io/learn/hybrid-search/)

---

*Document Version: 1.0*
*Created: 3 ก.พ. 2026*
