# YouTube Search Design

## Goal

Add a "Buscar" tab to the AddSongModal so users can search YouTube by name instead of pasting a URL. Clicking a result pre-fills step 2 (confirm) and the rest of the download flow continues unchanged.

---

## Context

The current AddSongModal has a step 1 where the user pastes a YouTube URL. The existing flow (URL → confirm → downloading → success) works well and must be preserved. This feature adds a second entry point via name search.

---

## What We're Building

Step 1 of the modal gains two tabs:

- **"Buscar"** (default): search field with debounce, shows up to 5 video results. Clicking a result skips the metadata fetch and goes straight to step 2 with title, artist, and youtube_url pre-filled.
- **"Colar URL"**: existing flow, unchanged.

Steps 2–4 (confirm → downloading → success) are identical regardless of which tab was used to enter.

---

## Architecture

### New Tauri command: `search_youtube`

Added to `src-tauri/src/lib.rs`. Spawns `yt-dlp --dump-json --no-playlist ytsearch5:{query}` with PATH set to `/opt/homebrew/bin`. Output is NDJSON (one JSON object per line); parsed into a `Vec<SearchResult>`. Returns an error string on failure.

```rust
#[derive(serde::Serialize)]
struct SearchResult {
    id: String,
    title: String,
    channel: String,     // mapped from yt-dlp's "uploader" field
    duration: u64,       // floor of yt-dlp's float "duration" field
    thumbnail: String,
    webpage_url: String,
}
```

Parse each NDJSON line as `serde_json::Value` and extract fields manually (yt-dlp field names differ from our struct names):

```rust
SearchResult {
    id:          v["id"].as_str().unwrap_or("").to_string(),
    title:       v["title"].as_str().unwrap_or("").to_string(),
    channel:     v["uploader"].as_str()
                   .or_else(|| v["channel"].as_str())
                   .unwrap_or("").to_string(),
    duration:    v["duration"].as_f64().unwrap_or(0.0) as u64,
    thumbnail:   v["thumbnail"].as_str().unwrap_or("").to_string(),
    webpage_url: v["webpage_url"].as_str().unwrap_or("").to_string(),
}
```

The command must be registered in `tauri::Builder::invoke_handler`.

### New TypeScript helper: `searchYoutube`

Added to `src/lib/ytdlp.ts`:

```ts
export type YTSearchResult = {
  id: string
  title: string
  channel: string
  duration: number
  thumbnail: string
  webpage_url: string
}

export async function searchYoutube(query: string): Promise<YTSearchResult[]>
```

Calls `invoke<YTSearchResult[]>('search_youtube', { query })`. Returns empty array on error (logs to console).

### AddSongModal changes (`src/components/AddSongModal.tsx`)

Step 1 gains:
- `tab` state: `'search' | 'url'`, default `'search'`
- Tab switcher UI: two tabs rendered above the input
- When `tab === 'search'`:
  - Search input with `useEffect` debounce (400ms): calls `searchYoutube(query)` when query length >= 2
  - Loading state (Loader2 spinner) while fetching
  - Result list: up to 5 cards (thumbnail, title, channel, duration formatted as m:ss)
  - Clicking a result sets `metadata` and `url` then advances to step 2 — no extra fetch needed
- When `tab === 'url'`:
  - Existing URL input + "Buscar informações" button (no changes)

**Transition to step 2 from search result:**

```ts
function handleSelectResult(r: YTSearchResult) {
  setUrl(r.webpage_url)
  setMetadata({
    title: r.title,
    artist: r.channel,
    thumbnail_url: r.thumbnail,
    normalizedUrl: r.webpage_url,
  })
  setStep(2)
}
```

Step 2 receives `metadata` already populated, so the existing confirm UI works as-is (editable title/artist, ministry chips, "Baixar música" button).

---

## Data Flow

```
User types query (>= 2 chars)
  → 400ms debounce fires
  → searchYoutube(query) → invoke('search_youtube')
  → Rust: yt-dlp ytsearch5:QUERY (NDJSON output)
  → Returns Vec<SearchResult> to JS
  → Results rendered as cards

User clicks a card
  → handleSelectResult(result)
  → metadata pre-filled, step → 2
  → User edits title/artist, picks ministries
  → "Baixar música" → existing download flow (steps 3 & 4)
```

---

## UI Details

**Result card:** thumbnail (56×36px, colored gradient fallback), title (truncated), channel, duration formatted as `m:ss`. First card gets a subtle blue highlight on hover.

**Empty / error states:**
- Query < 2 chars: show hint text "Digite pelo menos 2 caracteres"
- Loading: Loader2 spinner centered, results area hidden
- No results: Music icon + "Nenhum resultado encontrado"
- yt-dlp error: "Erro ao buscar. Tente novamente." (logs raw error to console)

**Debounce:** 400ms after last keystroke. Pressing Enter fires immediately (cancels pending debounce).

**Tab switch:** switching tabs clears query, results, and any error. The URL tab input is unaffected by search state.

---

## Files Changed

| File | Action |
|---|---|
| `src-tauri/src/lib.rs` | Add `search_youtube` command + `SearchResult` struct + register in invoke_handler |
| `src/lib/ytdlp.ts` | Add `YTSearchResult` type + `searchYoutube()` function |
| `src/components/AddSongModal.tsx` | Step 1: add tab state, tab switcher UI, search input, debounce, results list, `handleSelectResult` |

No other files change. Steps 2–4 of the modal, the URL flow, and all other pages are untouched.

---

## Out of Scope

- Search history / recent searches
- Thumbnail images loaded from YouTube CDN in results (gradient placeholder is sufficient; real thumbnail loads in step 2)
- Pagination or "load more" beyond 5 results
- Filtering by duration, channel, or date
