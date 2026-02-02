#!/usr/bin/env node

/**
 * Import Chat Files Script
 * Usage:
 *   node src/import.js              # Import new files only
 *   node src/import.js --all        # Re-import all files (clear DB first)
 *   node src/import.js file.txt     # Import specific file
 */

import { config } from './config.js';
import * as db from './db.js';
import { parseChatFile, extractMetadata } from './parser.js';
import { readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

async function getImportedFiles() {
  const database = db.getDB();
  if (!database) return new Set();

  const rows = database.prepare('SELECT DISTINCT chat_file FROM messages').all();
  return new Set(rows.map(r => r.chat_file));
}

async function importFile(filePath) {
  const filename = basename(filePath);
  console.log(`\nImporting: ${filename}`);

  try {
    const metadata = extractMetadata(filePath);
    console.log(`  Chat with: ${metadata.chatName}`);
    console.log(`  Saved on: ${metadata.savedOn}`);

    const messages = parseChatFile(filePath);
    console.log(`  Messages parsed: ${messages.length}`);

    if (messages.length > 0) {
      const inserted = db.insertMessages(messages);
      console.log(`  Imported: ${inserted} messages`);
      return inserted;
    }
    return 0;
  } catch (error) {
    console.error(`  Error: ${error.message}`);
    return 0;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes('--all');
  const specificFile = args.find(a => !a.startsWith('--'));

  // Initialize database
  await db.initDB();

  if (forceAll) {
    console.log('Clearing database and re-importing all files...');
    db.clearMessages();
  }

  const chatDir = config.CHAT_DIR;

  if (specificFile) {
    // Import specific file
    const filePath = specificFile.includes('/')
      ? specificFile
      : join(chatDir, specificFile);

    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    const imported = await importFile(filePath);
    console.log(`\nTotal imported: ${imported} messages`);
  } else {
    // Import all/new files
    if (!existsSync(chatDir)) {
      console.error(`Chat directory not found: ${chatDir}`);
      process.exit(1);
    }

    const files = readdirSync(chatDir).filter(f => f.endsWith('.txt'));

    if (files.length === 0) {
      console.log('No chat files found in', chatDir);
      process.exit(0);
    }

    const importedFiles = forceAll ? new Set() : await getImportedFiles();
    const newFiles = files.filter(f => !importedFiles.has(f));

    if (newFiles.length === 0) {
      console.log('No new files to import.');
      console.log(`Already imported: ${files.length} file(s)`);
      process.exit(0);
    }

    console.log(`Found ${newFiles.length} new file(s) to import`);

    let totalMessages = 0;
    for (const file of newFiles) {
      const filePath = join(chatDir, file);
      totalMessages += await importFile(filePath);
    }

    console.log(`\nTotal imported: ${totalMessages} messages`);
  }

  // Show stats
  const count = db.getMessageCount();
  console.log(`Database now has: ${count} messages`);

  db.closeDB();
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
