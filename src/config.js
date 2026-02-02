/**
 * Configuration for Chat MCP Server
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

export const config = {
  // Database settings
  DB_PATH: process.env.CHAT_DB_PATH || join(PROJECT_ROOT, 'db', 'chat.db'),
  DB_ENABLED: process.env.CHAT_DB_ENABLED !== 'false',

  // Chat history directory (raw text files)
  CHAT_DIR: process.env.CHAT_DIR || join(PROJECT_ROOT, 'data', 'raw'),

  // Search settings
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};
