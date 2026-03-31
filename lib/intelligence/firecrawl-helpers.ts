/**
 * Firecrawl CLI Helpers — shared utilities for intelligence providers
 *
 * Wraps the firecrawl CLI (search + scrape) and provides:
 * - File-based cache with per-key TTL (stored in .firecrawl/cache/)
 * - AI extraction helper using AI SDK generateText
 *
 * All functions fail-open (return null on error).
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FirecrawlSearchResult {
  url: string;
  title: string;
  description: string;
  position: number;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number; // Unix timestamp (ms)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_DIR = join(process.cwd(), ".firecrawl", "cache");
const CLI_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 2 * 1024 * 1024; // 2MB

// ---------------------------------------------------------------------------
// Firecrawl CLI Wrappers
// ---------------------------------------------------------------------------

/**
 * Search the web using the firecrawl CLI.
 * Returns parsed search results, or null on failure.
 *
 * @param query - Search query string
 * @param limit - Maximum number of results (default: 5, max: 100)
 */
export function firecrawlSearch(
  query: string,
  limit = 5,
): FirecrawlSearchResult[] | null {
  try {
    // Escape double quotes in the query to prevent shell injection
    const safeQuery = query.replace(/"/g, '\\"');
    const result = execSync(
      `firecrawl search "${safeQuery}" --limit ${limit} --json`,
      {
        timeout: CLI_TIMEOUT_MS,
        encoding: "utf8",
        maxBuffer: MAX_BUFFER,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    // Handle non-JSON responses (e.g. "No results found.")
    const trimmed = result.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return null; // Not JSON — likely "No results found."
    }

    const parsed = JSON.parse(trimmed);

    // Firecrawl search returns { success: true, data: { web: [...] } }
    if (parsed?.success && Array.isArray(parsed.data?.web)) {
      return parsed.data.web as FirecrawlSearchResult[];
    }

    // Alternate shape: direct array
    if (Array.isArray(parsed)) {
      return parsed as FirecrawlSearchResult[];
    }

    console.warn("[firecrawl] Unexpected search response shape:", typeof parsed);
    return null;
  } catch (error) {
    console.warn(
      `[firecrawl] Search failed for "${query}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Scrape a URL using the firecrawl CLI.
 * Returns the page content as markdown, or null on failure.
 *
 * @param url - URL to scrape
 * @param onlyMainContent - Strip boilerplate (default: true)
 */
export function firecrawlScrape(
  url: string,
  onlyMainContent = true,
): string | null {
  try {
    const safeUrl = url.replace(/"/g, '\\"');
    const mainContentFlag = onlyMainContent ? " --only-main-content" : "";
    const result = execSync(
      `firecrawl scrape "${safeUrl}"${mainContentFlag}`,
      {
        timeout: CLI_TIMEOUT_MS,
        encoding: "utf8",
        maxBuffer: MAX_BUFFER,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    if (!result || result.trim().length === 0) {
      console.warn(`[firecrawl] Empty scrape result for "${url}"`);
      return null;
    }

    return result;
  } catch (error) {
    console.warn(
      `[firecrawl] Scrape failed for "${url}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// File-based Cache
// ---------------------------------------------------------------------------

/**
 * Ensure the cache directory exists.
 */
function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Build a safe filename from a cache key.
 * Hashes the key to avoid filesystem issues with special characters.
 */
function cacheFilePath(key: string): string {
  const hash = hashString(key);
  return join(CACHE_DIR, `${hash}.json`);
}

/**
 * Get a cached value by key. Returns null if not found or expired.
 *
 * @param key - Cache key (arbitrary string)
 */
export function getFirecrawlCache<T>(key: string): T | null {
  try {
    const filePath = cacheFilePath(key);
    if (!existsSync(filePath)) return null;

    const raw = readFileSync(filePath, "utf8");
    const entry = JSON.parse(raw) as CacheEntry<T>;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      return null; // Expired — caller will refresh
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with a TTL in days.
 *
 * @param key - Cache key (arbitrary string)
 * @param data - Data to cache (must be JSON-serializable)
 * @param ttlDays - Time-to-live in days
 */
export function setFirecrawlCache<T>(
  key: string,
  data: T,
  ttlDays: number,
): void {
  try {
    ensureCacheDir();
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
    };
    const filePath = cacheFilePath(key);
    writeFileSync(filePath, JSON.stringify(entry), "utf8");
  } catch (error) {
    console.warn(
      "[firecrawl-cache] Failed to write cache:",
      error instanceof Error ? error.message : error,
    );
  }
}

// ---------------------------------------------------------------------------
// Firecrawl Map
// ---------------------------------------------------------------------------

/**
 * Map URLs on a website using the firecrawl CLI.
 * Discovers links on a site, optionally filtered by a search query.
 * Returns an array of discovered URL strings.
 *
 * @param url - Base URL to map
 * @param search - Optional search query to filter discovered URLs
 * @param limit - Maximum URLs to discover (default: 10)
 * @returns Array of discovered URL strings, or null on failure
 */
export function firecrawlMap(
  url: string,
  search?: string,
  limit = 10,
): string[] | null {
  try {
    const safeUrl = url.replace(/"/g, '\\"');
    let cmd = `firecrawl map "${safeUrl}" --limit ${limit} --json`;
    if (search) {
      const safeSearch = search.replace(/"/g, '\\"');
      cmd += ` --search "${safeSearch}"`;
    }

    const result = execSync(cmd, {
      timeout: CLI_TIMEOUT_MS,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const parsed = JSON.parse(result);

    // Handle various response shapes from the firecrawl CLI
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.links && Array.isArray(parsed.links)) return parsed.links;
    if (parsed?.urls && Array.isArray(parsed.urls)) return parsed.urls;
    if (parsed?.success && parsed?.data) {
      if (Array.isArray(parsed.data)) return parsed.data;
      if (Array.isArray(parsed.data.links)) return parsed.data.links;
    }

    console.warn("[firecrawl] Unexpected map response shape:", typeof parsed);
    return null;
  } catch (error) {
    console.warn(
      `[firecrawl] Map failed for "${url}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// AI Extraction Helper
// ---------------------------------------------------------------------------

/**
 * Extract structured data from markdown content using AI.
 *
 * Uses the shared getModel() factory (Groq -> OpenAI -> Ollama fallback)
 * with AI SDK generateText to parse unstructured markdown into a typed schema.
 *
 * @param markdown - Raw markdown content from firecrawl scrape
 * @param prompt - System prompt describing what to extract
 * @returns Parsed JSON object, or null on failure
 */
export async function extractWithAI<T>(
  markdown: string,
  prompt: string,
): Promise<T | null> {
  try {
    const { generateText } = await import("ai");
    const { getModel } = await import("@/lib/ai/model");

    // Truncate very long markdown to avoid token limits
    const truncatedMarkdown =
      markdown.length > 15_000 ? markdown.slice(0, 15_000) + "\n\n[...]" : markdown;

    // Try primary model (Groq), fall back to OpenAI on rate limit
    let result;
    try {
      const { model } = await getModel();
      result = await generateText({
        model,
        temperature: 0,
        maxOutputTokens: 2000,
        system: prompt,
        prompt: truncatedMarkdown,
      });
    } catch (primaryError) {
      const errMsg = primaryError instanceof Error ? primaryError.message : "";
      if (errMsg.includes("Rate limit") || errMsg.includes("429") || errMsg.includes("TPD")) {
        // Groq rate limited — try OpenAI as fallback
        if (process.env.OPENAI_API_KEY) {
          const { createOpenAI } = await import("@ai-sdk/openai");
          const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
          result = await generateText({
            model: openai("gpt-4o-mini"),
            temperature: 0,
            maxOutputTokens: 2000,
            system: prompt,
            prompt: truncatedMarkdown,
          });
        } else {
          throw primaryError; // No fallback available
        }
      } else {
        throw primaryError;
      }
    }

    // Extract JSON from the response — find the first { or [ and parse
    const text = result.text.trim();
    const jsonStart = text.indexOf("{");
    const jsonArrayStart = text.indexOf("[");

    let startIdx: number;
    if (jsonStart === -1 && jsonArrayStart === -1) {
      console.warn("[extractWithAI] No JSON found in response");
      return null;
    }
    if (jsonStart === -1) startIdx = jsonArrayStart;
    else if (jsonArrayStart === -1) startIdx = jsonStart;
    else startIdx = Math.min(jsonStart, jsonArrayStart);

    // Find matching end brace/bracket
    const isArray = text[startIdx] === "[";
    const openChar = isArray ? "[" : "{";
    const closeChar = isArray ? "]" : "}";

    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < text.length; i++) {
      if (text[i] === openChar) depth++;
      else if (text[i] === closeChar) {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx === -1) {
      console.warn("[extractWithAI] Unbalanced JSON in response");
      return null;
    }

    const jsonStr = text.slice(startIdx, endIdx + 1);
    return JSON.parse(jsonStr) as T;
  } catch (error) {
    console.warn(
      "[extractWithAI] AI extraction failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Simple string hash for cache file naming.
 * Produces a hex string safe for filenames.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  // Convert to unsigned hex for clean filenames
  return (hash >>> 0).toString(16).padStart(8, "0");
}
