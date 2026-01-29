/**
 * Chat History Parser
 * Parses LINE/WhatsApp exported chat history files
 */

import { readFileSync } from 'fs';

/**
 * Parse a chat history file
 * @param {string} filePath - Path to chat history file
 * @returns {Array} Array of message objects
 */
export function parseChatFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const messages = [];

  let currentDate = null;
  let currentMessage = null;
  const filename = filePath.split('/').pop();

  // Date pattern: "Thu, 8/14/2014" or "Mon, 1/29/2026"
  const datePattern = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

  // Message pattern: "HH:MM<tab>sender<tab>content"
  const messagePattern = /^(\d{1,2}:\d{2})\t(.+?)\t(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines
    if (!line.trim()) {
      // If we have a pending message, save it
      if (currentMessage) {
        messages.push(currentMessage);
        currentMessage = null;
      }
      continue;
    }

    // Check for date marker
    const dateMatch = line.match(datePattern);
    if (dateMatch) {
      // Save pending message
      if (currentMessage) {
        messages.push(currentMessage);
        currentMessage = null;
      }

      // Parse date: M/D/YYYY -> YYYY-MM-DD
      const month = dateMatch[2].padStart(2, '0');
      const day = dateMatch[3].padStart(2, '0');
      const year = dateMatch[4];
      currentDate = `${year}-${month}-${day}`;
      continue;
    }

    // Check for message
    const msgMatch = line.match(messagePattern);
    if (msgMatch && currentDate) {
      // Save pending message
      if (currentMessage) {
        messages.push(currentMessage);
      }

      currentMessage = {
        date: currentDate,
        time: msgMatch[1],
        sender: msgMatch[2].trim(),
        content: msgMatch[3],
        chat_file: filename,
      };
      continue;
    }

    // Continuation of previous message (multi-line)
    if (currentMessage && line.trim()) {
      currentMessage.content += '\n' + line;
    }
  }

  // Save last message
  if (currentMessage) {
    messages.push(currentMessage);
  }

  return messages;
}

/**
 * Extract chat metadata from file
 * @param {string} filePath - Path to chat history file
 * @returns {Object} Metadata object
 */
export function extractMetadata(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let chatName = '';
  let savedOn = '';

  // First line: "Chat history with <name>"
  if (lines[0]) {
    const match = lines[0].match(/^.?Chat history with (.+)$/);
    if (match) {
      chatName = match[1].trim();
    }
  }

  // Second line: "Saved on: <date>"
  if (lines[1]) {
    const match = lines[1].match(/^Saved on:\s+(.+)$/);
    if (match) {
      savedOn = match[1].trim();
    }
  }

  return { chatName, savedOn };
}
