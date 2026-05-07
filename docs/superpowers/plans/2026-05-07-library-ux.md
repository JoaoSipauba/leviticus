# Library UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four targeted UX improvements — dark scrollbar, hover-while-scrolling bug fix, smaller artist text, and inline song preview in AddSongModal.

**Architecture:** CSS utility class for scrollbars; JS scroll listener for the hover bug; single-line artist change; new `getPreviewUrl` Tauri command + Audio element + mini player UI in AddSongModal.

**Tech Stack:** React 18, TypeScript, Tailwind v3, lucide-react, Tauri v2 (Command shell plugin), HTML5 Audio API.

---

## File Map

| File | Change |
|---|---|
| `apps/desktop/src/index.css` | Add `.styled-scroll` scrollbar utility |
| `apps/desktop/src/pages/Library.tsx` | Add `styled-scroll` + scroll listener for hover fix |
| `apps/desktop/src/components/SongCard.tsx` | Artist: 10px inline style |
| `apps/desktop/src/lib/ytdlp.ts` | Add `getPreviewUrl` function |
| `apps/desktop/src-tauri/tauri.conf.json` | Add `*.googlevideo.com` to CSP `media-src` |
| `apps/desktop/src/components/AddSongModal.tsx` | Preview state + `SearchResultCard` play button + mini player |

---

## Task 1: Scrollbar design system + hover bug fix + artist size

**Files:**
- Modify: `apps/desktop/src/index.css`
- Modify: `apps/desktop/src/pages/Library.tsx`
- Modify: `apps/desktop/src/components/SongCard.tsx`

- [ ] **Step 1: Add `.styled-scroll` to `index.css`**

Open `apps/desktop/src/index.css`. Append after the last existing rule (after `.animate-search-progress`):

```css
/* Scrollbar design system */
.styled-scroll::-webkit-scrollbar { width: 5px; }
.styled-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 99px; }
.styled-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 99px; }
.styled-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
```

- [ ] **Step 2: Update Library.tsx — add `useRef`, scroll listener, and `styled-scroll`**

Open `apps/desktop/src/pages/Library.tsx`.

**2a — Add `useRef` to the React import (line 1):**
```tsx
import { useEffect, useRef, useState } from 'react'
```

**2b — Add `listRef` after the existing state declarations (after `const [loading, setLoading]`):**
```tsx
const listRef = useRef<HTMLDivElement>(null)
```

**2c — Add the scroll listener effect after the existing `useEffect` hooks (before the `return` statement):**
```tsx
useEffect(() => {
  const el = listRef.current
  if (!el) return
  let timer: ReturnType<typeof setTimeout>
  const onScroll = () => {
    el.style.pointerEvents = 'none'
    clearTimeout(timer)
    timer = setTimeout(() => { el.style.pointerEvents = '' }, 100)
  }
  el.addEventListener('scroll', onScroll, { passive: true })
  return () => { el.removeEventListener('scroll', onScroll); clearTimeout(timer) }
}, [])
```

**2d — Update the song list `<div>` (line 138). Current:**
```tsx
      <div className="space-y-2 flex-1 overflow-y-auto">
```
Replace with:
```tsx
      <div ref={listRef} className="space-y-2 flex-1 overflow-y-auto styled-scroll">
```

- [ ] **Step 3: Update SongCard.tsx — smaller artist**

Open `apps/desktop/src/components/SongCard.tsx`. Find line 183:
```tsx
        <p className="text-sm truncate" style={{ color: '#9ca3af' }}>
```
Replace with:
```tsx
        <p className="truncate" style={{ fontSize: 10, color: '#4b5563' }}>
```

- [ ] **Step 4: Build**

```bash
cd apps/desktop && pnpm build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/index.css \
        apps/desktop/src/pages/Library.tsx \
        apps/desktop/src/components/SongCard.tsx
git commit -m "feat: dark scrollbar, hover-scroll fix, smaller artist text"
```

---

## Task 2: `getPreviewUrl` + CSP

**Files:**
- Modify: `apps/desktop/src/lib/ytdlp.ts`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`

- [ ] **Step 1: Add `getPreviewUrl` to `ytdlp.ts`**

Open `apps/desktop/src/lib/ytdlp.ts`. Append after the closing brace of `fetchYoutubeMetadata` (at the end of the file):

```ts
export async function getPreviewUrl(videoId: string): Promise<string> {
  const extraPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin'
  const command = Command.create('yt-dlp', [
    '-f', 'bestaudio',
    '--get-url',
    `https://youtube.com/watch?v=${videoId}`,
  ], { env: { PATH: `${extraPath}:/usr/bin:/bin` } })
  const result = await command.execute()
  if (result.code !== 0) {
    console.error('[getPreviewUrl] yt-dlp failed:', result.stderr)
    throw new Error('Não foi possível carregar a pré-escuta.')
  }
  const url = result.stdout.trim().split('\n')[0]
  if (!url) throw new Error('Não foi possível carregar a pré-escuta.')
  return url
}
```

- [ ] **Step 2: Update CSP in `tauri.conf.json`**

Open `apps/desktop/src-tauri/tauri.conf.json`. Find the `"csp"` string. Current `media-src` value:
```
media-src asset: blob: http://127.0.0.1:*;
```
Change to:
```
media-src asset: blob: http://127.0.0.1:* https://*.googlevideo.com;
```

The full CSP line after the change should look like:
```json
"csp": "default-src 'self'; connect-src 'self' http://127.0.0.1:* https://*.supabase.co https://*.supabase.io wss://*.supabase.co https://img.youtube.com; img-src 'self' data: https://img.youtube.com asset: blob:; media-src asset: blob: http://127.0.0.1:* https://*.googlevideo.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
```

- [ ] **Step 3: Build**

```bash
cd apps/desktop && pnpm build
```

Expected: clean build. TypeScript should compile `getPreviewUrl` without errors since it uses the same `Command` import already in the file.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/lib/ytdlp.ts \
        apps/desktop/src-tauri/tauri.conf.json
git commit -m "feat: add getPreviewUrl and allow YouTube CDN in CSP"
```

---

## Task 3: AddSongModal — preview state, play button, mini player

**Files:**
- Modify: `apps/desktop/src/components/AddSongModal.tsx`

This task has several sub-steps. Read the full file before starting so you understand the existing structure.

**Context:**
- `fmtDuration` is already defined at line ~245 in this file — do NOT add a duplicate.
- `SearchResultCard` component is at lines ~251–328. It is currently a `<button>` element — change it to a `<div>` so inner buttons are valid HTML.
- The search results map is at line ~879: `{searchResults.map((r) => (<SearchResultCard key={r.id} .../>))}`
- Lucide imports line: `import { AlertTriangle, Check, ChevronLeft, Download, Headphones, Info, Loader2, Mic, Music, Plus, Search, X } from 'lucide-react'`

- [ ] **Step 1: Add `Play`, `Pause`, `Square` to lucide-react import**

Find the lucide import. Replace it with:
```ts
import { AlertTriangle, Check, ChevronLeft, Download, Headphones, Info, Loader2, Mic, Music, Pause, Play, Plus, Search, Square, X } from 'lucide-react'
```

- [ ] **Step 2: Add `getPreviewUrl` to the ytdlp import**

Find the import from `'../lib/ytdlp.js'`. It currently imports `fetchYoutubeMetadata`, `downloadSong`, `searchYoutube`, `YTSearchResult`. Add `getPreviewUrl`:
```ts
import { fetchYoutubeMetadata, downloadSong, searchYoutube, getPreviewUrl, type YTSearchResult } from '../lib/ytdlp.js'
```

- [ ] **Step 3: Add preview state and `audioRef`**

Find the comment `// step 3` and the `const [progress, setProgress]` line. Add the preview state block right before it (around line 408):

```ts
  // preview
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewTime, setPreviewTime] = useState(0)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [previewPlaying, setPreviewPlaying] = useState(false)
```

`useRef` is already imported from React in this file (check the import — it has `useRef` for `searchTimerRef` and `downloadStartRef`). No import change needed.

- [ ] **Step 4: Add `stopPreview` helper**

Add this function inside the component, right after the `triggerClose` / `handleAnimationEnd` block (before `resetToStep1`):

```ts
  function stopPreview() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    setPreviewId(null)
    setPreviewLoading(false)
    setPreviewTime(0)
    setPreviewDuration(0)
    setPreviewPlaying(false)
  }
```

- [ ] **Step 5: Add `handlePreview` function**

Add immediately after `stopPreview`:

```ts
  async function handlePreview(result: YTSearchResult) {
    if (previewId === result.id) {
      if (audioRef.current) {
        if (previewPlaying) { audioRef.current.pause(); setPreviewPlaying(false) }
        else { void audioRef.current.play(); setPreviewPlaying(true) }
      }
      return
    }
    stopPreview()
    setPreviewId(result.id)
    setPreviewLoading(true)
    try {
      const url = await getPreviewUrl(result.id)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.ontimeupdate = () => setPreviewTime(audio.currentTime)
      audio.onloadedmetadata = () => setPreviewDuration(audio.duration)
      audio.onended = () => setPreviewPlaying(false)
      audio.onerror = () => {
        console.error('[preview] audio playback error')
        stopPreview()
      }
      void audio.play()
      setPreviewPlaying(true)
    } catch (e) {
      console.error('[handlePreview]', e)
      stopPreview()
    } finally {
      setPreviewLoading(false)
    }
  }
```

- [ ] **Step 6: Wire `stopPreview` into cleanup points**

**6a — `resetToStep1`**: Add `stopPreview()` as the first line of the function body:
```ts
  function resetToStep1() {
    stopPreview()
    setStep(1)
    // ... rest unchanged
```

**6b — `handleSelectResult`**: Add `stopPreview()` as the first line of the function body (before the `setFetching` call):
```ts
  async function handleSelectResult(result: YTSearchResult) {
    stopPreview()
    // ... rest unchanged
```

**6c — modal-close `useEffect`**: The effect that watches `showAddSong` (around line 425) already calls `resetToStep1()` when the modal opens. Since `resetToStep1` now calls `stopPreview`, this is handled automatically. No extra change needed here.

- [ ] **Step 7: Update `SearchResultCard` — change outer element and add play button**

The current `SearchResultCard` is a `<button>` wrapping everything. Change the outer element to a `<div>` (nested buttons require a block container, not another button).

Find the `SearchResultCard` component (lines ~251–328). Replace the **entire component** with:

```tsx
function SearchResultCard({
  result,
  loading,
  onClick,
  onPreview,
  isPreviewing,
  isPreviewLoading,
  isPreviewPlaying,
}: {
  result: YTSearchResult
  loading: boolean
  onClick: () => void
  onPreview: () => void
  isPreviewing: boolean
  isPreviewLoading: boolean
  isPreviewPlaying: boolean
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
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
      {/* Thumbnail */}
      <div style={{ width: 56, height: 36, borderRadius: 6, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg,#1e3a8a,#2563eb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Music size={13} color="rgba(255,255,255,0.4)" />
        </div>
        <img
          src={`https://img.youtube.com/vi/${result.id}/mqdefault.jpg`}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
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

      {/* Preview button */}
      <button
        onClick={(e) => { e.stopPropagation(); onPreview() }}
        style={{
          width: 26, height: 26, borderRadius: '50%',
          border: '1px solid rgba(37,99,235,0.4)',
          background: isPreviewing ? 'rgba(37,99,235,0.35)' : 'rgba(37,99,235,0.15)',
          color: '#60a5fa', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hov || isPreviewing ? 1 : 0,
          transition: 'opacity 0.15s, background 0.15s',
        }}
      >
        {isPreviewLoading
          ? <Loader2 size={10} className="animate-spin-smooth" />
          : isPreviewPlaying
            ? <Square size={10} fill="#60a5fa" strokeWidth={0} />
            : <Play size={10} fill="#60a5fa" strokeWidth={0} />}
      </button>
    </div>
  )
}
```

- [ ] **Step 8: Update the `searchResults.map(...)` call to pass new props and render mini player**

Find (around line 878–889):
```tsx
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
```

Replace with:

```tsx
                  {!searching && searchResults.length > 0 && (
                    <div className="styled-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                      {searchResults.map((r) => (
                        <React.Fragment key={r.id}>
                          <SearchResultCard
                            result={r}
                            loading={fetching}
                            onClick={() => !fetching && handleSelectResult(r)}
                            onPreview={() => handlePreview(r)}
                            isPreviewing={previewId === r.id}
                            isPreviewLoading={previewLoading && previewId === r.id}
                            isPreviewPlaying={previewPlaying && previewId === r.id}
                          />
                          {previewId === r.id && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 12px',
                              background: 'rgba(37,99,235,0.08)',
                              border: '1px solid rgba(37,99,235,0.22)',
                              borderRadius: 10,
                              marginTop: -2,
                            }}>
                              <button
                                onClick={() => handlePreview(r)}
                                style={{
                                  width: 28, height: 28, borderRadius: '50%', border: 'none',
                                  background: '#2563eb', cursor: 'pointer', flexShrink: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                {previewPlaying
                                  ? <Pause size={11} color="white" fill="white" />
                                  : <Play size={11} color="white" fill="white" />}
                              </button>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>
                                  <span>{fmtDuration(Math.floor(previewTime))}</span>
                                  <span>{previewDuration > 0 ? fmtDuration(Math.floor(previewDuration)) : '--:--'}</span>
                                </div>
                                <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%',
                                    width: previewDuration > 0 ? `${(previewTime / previewDuration) * 100}%` : '0%',
                                    background: 'linear-gradient(90deg,#2563eb,#60a5fa)',
                                    borderRadius: 99,
                                    transition: 'width 0.5s linear',
                                  }} />
                                </div>
                              </div>
                              <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>Pré-escuta</span>
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
```

Add `import React from 'react'` if `React` is not already imported (needed for `React.Fragment`). Check the current top import — if it uses `import { ... } from 'react'` without a default import, add `import React, { ... } from 'react'` or use `<>...</>` fragments instead of `<React.Fragment>`.

- [ ] **Step 9: Build**

```bash
cd apps/desktop && pnpm build
```

Expected: clean build. If you get "React is not defined", either add `import React from 'react'` or replace `<React.Fragment key={r.id}>` / `</React.Fragment>` with `<React.Fragment key={r.id}>` via the named import: add `Fragment` to the React import: `import { ..., Fragment } from 'react'` and use `<Fragment key={r.id}>...</Fragment>`.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/components/AddSongModal.tsx
git commit -m "feat: inline song preview in AddSongModal search results"
```

---

## Self-Review

**Spec coverage:**
- ✅ Scrollbar `.styled-scroll` — Task 1 Step 1
- ✅ Apply to Library list — Task 1 Step 2d
- ✅ Apply to search results — Task 3 Step 8
- ✅ Hover bug fix — Task 1 Step 2c
- ✅ Artist 10px — Task 1 Step 3
- ✅ `getPreviewUrl` — Task 2 Step 1
- ✅ CSP `*.googlevideo.com` — Task 2 Step 2
- ✅ Preview state + audioRef — Task 3 Steps 3–5
- ✅ `stopPreview` cleanup in `resetToStep1`, `handleSelectResult` — Task 3 Step 6
- ✅ `SearchResultCard` play button — Task 3 Step 7
- ✅ Mini player below active card — Task 3 Step 8

**Type consistency:**
- `getPreviewUrl(videoId: string)` defined in Task 2, called in `handlePreview` in Task 3 ✅
- `YTSearchResult` used in both `SearchResultCard` props and `handlePreview` ✅
- `isPreviewing`, `isPreviewLoading`, `isPreviewPlaying` props match the button logic in Step 7 ✅
- `previewTime`, `previewDuration` used in mini player JSX match state names in Step 3 ✅
