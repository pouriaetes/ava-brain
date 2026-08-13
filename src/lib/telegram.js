// Telegram Bot API helper for sending messages, typing, and formatting
// No secrets exposed, owner-only checked by caller

import { log } from "./logger.js";

const TELEGRAM_API = "https://api.telegram.org/bot";
const MAX_MESSAGE_LENGTH = 4096; // Telegram max message length

export async function sendTelegramMessage(config, chatId, text, options = {}) {
  const { TELEGRAM_BOT_TOKEN } = config;
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }

  // Split long messages
  const messages = splitMessage(text, options.maxLength || MAX_MESSAGE_LENGTH);
  const results = [];

  for (const chunk of messages) {
    const payload = {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: options.disable_web_page_preview ?? true,
    };

    if (options.parse_mode) {
      payload.parse_mode = options.parse_mode;
    }

    if (options.reply_to_message_id) {
      payload.reply_to_message_id = options.reply_to_message_id;
    }

    if (options.reply_markup) {
      payload.reply_markup = options.reply_markup;
    }

    const url = `${TELEGRAM_API}${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error: ${response.status} ${errorText}`);
    }

    results.push(await response.json());
  }

  return results;
}

export async function downloadTelegramFile(config, fileId) {
  const { TELEGRAM_BOT_TOKEN } = config;
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }
  const getFileUrl = `${TELEGRAM_API}${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  const getFileResponse = await fetch(getFileUrl);
  if (!getFileResponse.ok) {
    const errorText = await getFileResponse.text();
    throw new Error(`Telegram getFile error: ${getFileResponse.status} ${errorText}`);
  }
  const getFileData = await getFileResponse.json();
  const filePath = getFileData?.result?.file_path;
  if (!filePath) {
    throw new Error("Telegram getFile did not return a file_path");
  }
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    throw new Error(`Telegram file download error: ${fileResponse.status}`);
  }
  return await fileResponse.arrayBuffer();
}

export async function sendTelegramPhoto(config, chatId, imageBase64, caption = "") {
  const { TELEGRAM_BOT_TOKEN } = config;
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }
  const binaryString = atob(imageBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const formData = new FormData();
  formData.append("chat_id", chatId);
  if (caption) formData.append("caption", caption);
  formData.append("photo", new Blob([bytes], { type: "image/png" }), "image.png");
  const url = `${TELEGRAM_API}${TELEGRAM_BOT_TOKEN}/sendPhoto`;
  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram sendPhoto error: ${response.status} ${errorText}`);
  }
  return await response.json();
}

export async function sendTelegramAudio(config, chatId, audioBase64, caption = "") {
  const { TELEGRAM_BOT_TOKEN } = config;
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }
  const binaryString = atob(audioBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const formData = new FormData();
  formData.append("chat_id", chatId);
  if (caption) formData.append("caption", caption);
  formData.append("audio", new Blob([bytes], { type: "audio/mpeg" }), "voice.mp3");
  const url = `${TELEGRAM_API}${TELEGRAM_BOT_TOKEN}/sendAudio`;
  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram sendAudio error: ${response.status} ${errorText}`);
  }
  return await response.json();
}

export async function sendTypingAction(config, chatId) {
  const { TELEGRAM_BOT_TOKEN } = config;
  if (!TELEGRAM_BOT_TOKEN) return;

  const url = `${TELEGRAM_API}${TELEGRAM_BOT_TOKEN}/sendChatAction`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

export function splitMessage(text, maxLength = MAX_MESSAGE_LENGTH) {
  if (!text || text.length <= maxLength) return [text];

  const chunks = [];
  let current = "";
  const sentences = text.split(/(?<=[.!?\n])\s+/);

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLength) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence + " ";
    }
  }

  if (current) chunks.push(current.trim());

  // If any chunk is still too long, split by words
  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLength) {
      finalChunks.push(chunk);
    } else {
      let temp = "";
      const words = chunk.split(" ");
      for (const word of words) {
        if (temp.length + word.length + 1 > maxLength) {
          finalChunks.push(temp.trim());
          temp = word + " ";
        } else {
          temp += word + " ";
        }
      }
      if (temp) finalChunks.push(temp.trim());
    }
  }

  return finalChunks.filter(Boolean);
}

export function markdownToTelegram(text) {
  // Convert common markdown to Telegram-safe HTML
  if (!text) return "";

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

export function isGroup(chatType) {
  return chatType === "group" || chatType === "supergroup";
}

export function isBotMentioned(text, botName) {
  if (!text || !botName) return false;
  const lowerText = text.toLowerCase();
  return lowerText.includes(`@${botName.toLowerCase()}`);
}