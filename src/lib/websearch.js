export async function fetchUrlContent(url, timeoutMs = 15000) {
  // Restrict to http(s) explicitly so non-web schemes (e.g. file://) are rejected
  // before any fetch attempt. Throws, matching the function's existing failure
  // convention (the caller catches and shows a friendly error).
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Unsupported URL scheme");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });

    // Cap the download size so a very large/slow-draining endpoint cannot be read
    // fully into memory (defense-in-depth on top of the 6000-char truncation below).
    const MAX_FETCH_BYTES = 500000;
    const reader = response.body.getReader();
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      chunks.push(value);
      if (received >= MAX_FETCH_BYTES) {
        await reader.cancel();
        break;
      }
    }
    let html;
    if (chunks.length === 0) {
      html = "";
    } else if (chunks.length === 1) {
      html = new TextDecoder().decode(chunks[0]);
    } else {
      const merged = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      html = new TextDecoder().decode(merged);
    }

    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    return stripped.substring(0, 6000);
  } finally {
    clearTimeout(timeoutId);
  }
}
