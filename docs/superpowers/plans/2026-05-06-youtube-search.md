# YouTube Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Buscar" tab to the AddSongModal step 1 so users can search YouTube by name, see up to 5 results, click one, and continue through the existing confirm → download → success flow.

**Architecture:** `searchYoutube(query)` is added to `src/lib/ytdlp.ts` using the same `Command.create('yt-dlp', [...])` pattern already used by `fetchYoutubeMetadata` — no Rust changes needed. The AddSongModal gains a `tab` state, a debounced search input, a results list, and a `handleSelectResult` that pre-fills step 2 identically to the URL flow.

**Tech Stack:** TypeScript, React 18, `@tauri-apps/plugin-shell` (Command.create), yt-dlp (already installed at `/opt/homebrew/bin/yt-dlp`)

---

## File Map

| File | Change |
|---|---|
| `apps/desktop/src/lib/ytdlp.ts` | Add `YTSearchResult` type + `searchYoutube()` function |
| `apps/desktop/src/components/AddSongModal.tsx` | Step 1: tab switcher, search input + debounce, results list, `handleSelectResult` |

No Rust changes. No capability changes (yt-dlp with `args: true` is already allowed in `src-tauri/capabilities/default.json`).

---

## Task 1: `searchYoutube` function

**Files:**
- Modify: `apps/desktop/src/lib/ytdlp.ts`

- [ ] **Step 1: Add the `YTSearchResult` type and `searchYoutube` function**

Open `apps/desktop/src/lib/ytdlp.ts` and append at the end of the file (after `fetchYoutubeMetadata`):

```ts
export type YTSearchResult = {
  id: string
  title: string
  channel: string
  duration: number      // seconds (integer)
  webpage_url: string
}

export async function searchYoutube(query: string): Promise<YTSearchResult[]> {
  if (!query.trim()) return []

  const command = Command.create('yt-dlp', [
    '--dump-json',
    '--no-playlist',
    '--flat-playlist',
    `ytsearch5:${query}`,
  ])

  let stdout = ''
  command.stdout.on('data', (line: string) => { stdout += line + '\n' })

  const result = await command.execute()
  if (result.code !== 0) {
    console.error('[searchYoutube] yt-dlp error:', result.stderr)
    return []
  }

  // yt-dlp outputs NDJSON: one JSON object per line
  const output = stdout || result.stdout
  return output
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const v = JSON.parse(line)
        if (!v.id || !v.title) return []
        return [{
          id:          String(v.id),
          title:       String(v.title),
          channel:     String(v.uploader ?? v.channel ?? ''),
          duration:    Math.floor(Number(v.duration) || 0),
          webpage_url: String(v.webpage_url ?? `https://www.youtube.com/watch?v=${v.id}`),
        }]
      } catch {
        return []
      }
    })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/lib/ytdlp.ts
git commit -m "feat: add searchYoutube helper using yt-dlp ytsearch5"
```

---

## Task 2: AddSongModal — tabs + search UI

**Files:**
- Modify: `apps/desktop/src/components/AddSongModal.tsx`

This task modifies the modal in several focused steps. Read the full current file before starting.

### Step 2a — Add imports and new state

- [ ] **Step 1: Add `searchYoutube` and `YTSearchResult` to the ytdlp import**

Current import line (line 16):
```ts
import { fetchYoutubeMetadata, downloadSong } from '../lib/ytdlp.js'
```

Replace with:
```ts
import { fetchYoutubeMetadata, downloadSong, searchYoutube, YTSearchResult } from '../lib/ytdlp.js'
```

- [ ] **Step 2: Add `useRef` to the React import (it's already there — confirm it is)**

Current line 1:
```ts
import { useEffect, useRef, useState } from 'react'
```
`useRef` is already imported. No change needed.

- [ ] **Step 3: Add new state variables after the existing `// error` state block**

The existing state block ends around line 272 (`const [error, setError] = useState<string | null>(null)`).

Add right after it:

```ts
  // search tab state
  const [tab, setTab] = useState<'search' | 'url'>('search')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<YTSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

- [ ] **Step 4: Update `resetToStep1` to clear search state**

Current `resetToStep1` (around line 302):
```ts
  function resetToStep1() {
    setStep(1)
    setUrl('')
    setMetadata(null)
    setTitle('')
    setArtist('')
    setGroups([])
    setSelectedGroups([])
    setOrgId('')
    setProgress(0)
    setError(null)
    setSaving(false)
    setFetching(false)
  }
```

Replace with:
```ts
  function resetToStep1() {
    setStep(1)
    setUrl('')
    setMetadata(null)
    setTitle('')
    setArtist('')
    setGroups([])
    setSelectedGroups([])
    setOrgId('')
    setProgress(0)
    setError(null)
    setSaving(false)
    setFetching(false)
    setTab('search')
    setQuery('')
    setSearchResults([])
    setSearchError(null)
    setSearching(false)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }
```

### Step 2b — Add search logic functions

- [ ] **Step 5: Add `switchTab`, `doSearch`, and `handleSelectResult` functions**

Add these three functions right after `resetToStep1`, before `handleFetchMetadata`:

```ts
  // ── search tab logic ──────────────────────────────────────────────────────

  function switchTab(t: 'search' | 'url') {
    setTab(t)
    setQuery('')
    setSearchResults([])
    setSearchError(null)
    setError(null)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }

  async function doSearch(q: string) {
    if (q.trim().length < 2) { setSearchResults([]); return }
    setSearching(true)
    setSearchError(null)
    try {
      const results = await searchYoutube(q)
      setSearchResults(results)
      if (results.length === 0) setSearchError('Nenhum resultado encontrado.')
    } catch {
      setSearchError('Erro ao buscar. Tente novamente.')
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  async function handleSelectResult(r: YTSearchResult) {
    setError(null)
    setFetching(true)
    try {
      const currentOrgId = localStorage.getItem('leviticus_org_id') ?? ''

      const { data: existing } = await supabase
        .from('songs')
        .select('id')
        .eq('youtube_url', r.webpage_url)
        .eq('org_id', currentOrgId)
        .maybeSingle()

      if (existing) {
        await syncOrg(currentOrgId)
        setError('Essa música já existe na biblioteca. A biblioteca foi sincronizada.')
        return
      }

      const db = await getDb()
      const rows = await db.select<GroupRow[]>(
        'SELECT id, name FROM groups WHERE org_id = ?',
        [currentOrgId]
      )

      const thumbnailUrl = `https://img.youtube.com/vi/${r.id}/mqdefault.jpg`
      setMetadata({
        title: r.title,
        artist: r.channel,
        thumbnail_url: thumbnailUrl,
        duration_seconds: r.duration,
        normalizedUrl: r.webpage_url,
      })
      setTitle(r.title)
      setArtist(r.channel)
      setGroups(rows)
      setOrgId(currentOrgId)
      setStep(2)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.')
    } finally {
      setFetching(false)
    }
  }
```

- [ ] **Step 6: Add debounce effect for the search input**

Add this `useEffect` after the existing `// escape key` useEffect block (around line 291):

```ts
  // debounce search query
  useEffect(() => {
    if (tab !== 'search') return
    if (query.trim().length < 2) { setSearchResults([]); setSearchError(null); return }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => doSearch(query), 400)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [query, tab])
```

### Step 2c — Update the step 1 render

- [ ] **Step 7: Update the step 1 subtitle in the header**

Current subtitle (inside the header `<div>`, around line 501):
```tsx
            {step === 1 && 'Cole o link do YouTube'}
```

Replace with:
```tsx
            {step === 1 && (tab === 'search' ? 'Pesquise por nome ou artista' : 'Cole o link do YouTube')}
```

- [ ] **Step 8: Replace the entire step 1 render block**

Find the step 1 block (starts at `{step === 1 && (` around line 548, ends just before `{/* ── Step 2 ──`). Replace it entirely with:

```tsx
          {/* ── Step 1 ────────────────────────────────── */}
          {step === 1 && (
            <div className="animate-fade-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Tab switcher */}
              <div
                style={{
                  display: 'flex',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10,
                  padding: 3,
                  gap: 2,
                }}
              >
                {(['search', 'url'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => switchTab(t)}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: tab === t ? 'rgba(37,99,235,0.25)' : 'transparent',
                      color: tab === t ? '#93c5fd' : '#6b7280',
                      transition: 'all 0.15s',
                    }}
                  >
                    {t === 'search' ? 'Buscar' : 'Colar URL'}
                  </button>
                ))}
              </div>

              {/* ── Search tab ── */}
              {tab === 'search' && (
                <>
                  <div style={{ position: 'relative' }}>
                    <ModalInput
                      value={query}
                      onChange={setQuery}
                      placeholder="Nome da música ou artista…"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
                          doSearch(query)
                        }
                      }}
                    />
                  </div>

                  {/* Loading */}
                  {searching && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                      <Loader2 size={18} color="#3b82f6" className="animate-spin-smooth" />
                    </div>
                  )}

                  {/* Hint */}
                  {!searching && query.trim().length < 2 && query.length > 0 && (
                    <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                      Digite pelo menos 2 caracteres
                    </p>
                  )}

                  {/* Search error */}
                  {!searching && searchError && (
                    <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{searchError}</p>
                  )}

                  {/* Results */}
                  {!searching && searchResults.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {searchResults.map((r) => (
                        <SearchResultCard
                          key={r.id}
                          result={r}
                          loading={fetching}
                          onClick={() => !fetching && handleSelectResult(r)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Error from handleSelectResult */}
                  {error && (
                    <p role="alert" style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>
                  )}
                </>
              )}

              {/* ── URL tab ── */}
              {tab === 'url' && (
                <>
                  <div
                    style={{
                      background: 'rgba(30,58,138,0.15)',
                      border: '1px solid rgba(59,130,246,0.18)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      fontSize: 12,
                      color: '#93c5fd',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                    }}
                  >
                    <Info size={14} color="#3b82f6" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                    Funciona com youtube.com, youtu.be, Shorts e YouTube Music
                  </div>

                  <ModalInput
                    value={url}
                    onChange={setUrl}
                    placeholder="https://youtube.com/watch?v=…"
                    type="url"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleFetchMetadata()}
                  />

                  {error && (
                    <p role="alert" style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>
                  )}

                  <BtnPrimary onClick={handleFetchMetadata} disabled={!url.trim() || fetching}>
                    {fetching ? (
                      <>
                        <Loader2 size={14} className="animate-spin-smooth" />
                        Buscando…
                      </>
                    ) : (
                      <>
                        <Search size={14} />
                        Buscar informações
                      </>
                    )}
                  </BtnPrimary>
                </>
              )}
            </div>
          )}
```

### Step 2d — Add SearchResultCard sub-component

- [ ] **Step 9: Add the `SearchResultCard` sub-component**

Add this component after the existing `GroupChip` component (before `// ─── main component`):

```tsx
function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function SearchResultCard({
  result,
  loading,
  onClick,
}: {
  result: YTSearchResult
  loading: boolean
  onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 10px',
        borderRadius: 10,
        background: hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
        border: hov
          ? '1px solid rgba(255,255,255,0.1)'
          : '1px solid rgba(255,255,255,0.05)',
        cursor: loading ? 'default' : 'pointer',
        width: '100%',
        textAlign: 'left',
        opacity: loading ? 0.6 : 1,
        transition: 'all 0.15s',
      }}
    >
      {/* Thumbnail placeholder */}
      <div
        style={{
          width: 56, height: 36, borderRadius: 6, flexShrink: 0,
          background: 'linear-gradient(135deg,#1e3a8a,#2563eb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Music size={13} color="rgba(255,255,255,0.4)" />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 12, fontWeight: 600, color: '#f3f4f6',
          margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {result.title}
        </p>
        <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>
          {result.channel}
        </p>
      </div>

      {/* Duration */}
      {result.duration > 0 && (
        <span style={{
          fontSize: 10, color: '#4b5563', flexShrink: 0,
          background: 'rgba(255,255,255,0.05)',
          padding: '2px 6px', borderRadius: 4,
        }}>
          {fmtDuration(result.duration)}
        </span>
      )}
    </button>
  )
}
```

### Step 2e — Verify and commit

- [ ] **Step 10: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm build
```

Expected: clean build, zero TypeScript errors.

- [ ] **Step 11: Manual smoke test**

Start the app: `cd apps/desktop && pnpm tauri dev`

Test the search tab:
1. Click "Adicionar" → modal opens on "Buscar" tab
2. Type less than 2 chars → no search triggered
3. Type "hosanna hillsong" → after 400ms, spinner appears, then up to 5 results
4. Press Enter while typing → search fires immediately (no wait)
5. Click a result → brief loading, then step 2 pre-filled with title/artist
6. Complete the flow (pick ministry → Baixar música → download → success)

Test the URL tab:
1. Click "Colar URL" tab
2. Paste a YouTube URL → "Buscar informações" → existing flow unchanged

Test tab switch:
1. Type a query in "Buscar" tab
2. Switch to "Colar URL" → query clears, error clears
3. Switch back to "Buscar" → empty, ready for new query

- [ ] **Step 12: Commit**

```bash
git add apps/desktop/src/components/AddSongModal.tsx
git commit -m "feat: add YouTube search tab to AddSongModal"
```

---

## Final commit

- [ ] **Push to remote**

```bash
git push
```
