# Library UX — Scroll, Hover Bug, Artist Size, Pré-escuta

## Goal

Four targeted UX improvements to the Library and AddSongModal:
1. **Scroll design system** — thin dark scrollbar consistent with the app theme
2. **Hover bug fix** — library card hover state persists while scrolling; must vanish
3. **Artist name smaller** — reduce visual weight of the artist line in SongCard
4. **Inline song preview** — play a song from search results before downloading it

---

## Architecture

### Scrollbar

Add a utility CSS class `.styled-scroll` in `index.css` and apply it to every scrollable container in the app. No new dependencies.

### Hover bug

Use a JavaScript scroll listener on the Library's song list `<div>`. While scrolling, add `pointer-events: none` directly on the element via `style`. A 100ms debounced timeout restores pointer events. This is the minimal reliable fix — no extra DOM nodes, no CSS-only hacks.

### Artist name

One-line change to `SongCard.tsx`: remove Tailwind's `text-sm` class (14 px) from the artist `<p>`, replace with inline `style={{ fontSize: 10, color: '#4b5563' }}`. The color gets slightly darker (`#4b5563` vs current `#9ca3af`) to reinforce the visual hierarchy title → artist → pill.

### Inline preview

**New Tauri command** (`getPreviewUrl`) in `ytdlp.ts`:
- Runs `yt-dlp -f bestaudio --get-url <url>` — takes ~1-2 s
- Returns the direct audio stream URL (hosted on `*.googlevideo.com`)

**CSP update** in `src-tauri/tauri.conf.json`:
- Add `https://*.googlevideo.com` to `media-src` so the WebKit WebView can load the stream

**State** added to `AddSongModal`:
- `previewId: string | null` — which result is currently previewing
- `previewLoading: boolean` — while yt-dlp extracts the URL
- `audioRef: useRef<HTMLAudioElement | null>` — single reusable Audio element

**UI in `SearchResultCard`** (defined inside `AddSongModal.tsx`):
- Play/stop icon button (16 px, blue pill style) appears on hover; stays visible when this card is the active preview
- Clicking starts loading → shows spinner → plays on success
- Mini player renders **immediately below** the active result card:
  - Play/pause button + elapsed time / total time + `Pré-escuta` label
  - Progress bar (same style as download bar: 3 px, gradient `#2563eb → #60a5fa`)
  - Driven by `audio.ontimeupdate` and `audio.duration`

**Cleanup rules:**
- Stop + reset audio when a different result is clicked for preview
- Stop + reset when modal step changes (step 1 → 2) or modal closes
- Stop + reset when the modal's `resetToStep1` is called

---

## Files changed

| File | Action |
|---|---|
| `apps/desktop/src/index.css` | Add `.styled-scroll` scrollbar rules |
| `apps/desktop/src/pages/Library.tsx` | Add `styled-scroll` class + scroll listener for hover fix |
| `apps/desktop/src/components/SongCard.tsx` | Artist: remove `text-sm`, add inline `fontSize: 10, color: '#4b5563'` |
| `apps/desktop/src/lib/ytdlp.ts` | Add `getPreviewUrl(videoId: string): Promise<string>` |
| `apps/desktop/src-tauri/tauri.conf.json` | Add `https://*.googlevideo.com` to `media-src` |
| `apps/desktop/src/components/AddSongModal.tsx` | Preview state + `SearchResultCard` play button + mini player |

---

## Scrollbar CSS (full rule)

```css
/* index.css — append after existing animations */
.styled-scroll::-webkit-scrollbar { width: 5px; }
.styled-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 99px; }
.styled-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 99px; }
.styled-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
```

Apply `styled-scroll` to:
- Library song list (`div` at line 138 of Library.tsx, currently `space-y-2 flex-1 overflow-y-auto`)
- AddSongModal search results container (the `div` wrapping `{searchResults.map(...)}` at line ~879)
- Any other `overflow-y-auto` containers found in the codebase (EditSongModal group list, etc.)

---

## Hover fix (Library.tsx)

```tsx
const listRef = useRef<HTMLDivElement>(null)

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

Attach `ref={listRef}` to the song list `<div>`.

---

## `getPreviewUrl` (ytdlp.ts)

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

---

## Preview state & audio (AddSongModal.tsx)

```ts
// refs (outside JSX)
const audioRef = useRef<HTMLAudioElement | null>(null)

// state
const [previewId, setPreviewId] = useState<string | null>(null)
const [previewLoading, setPreviewLoading] = useState(false)
const [previewTime, setPreviewTime] = useState(0)       // elapsed seconds
const [previewDuration, setPreviewDuration] = useState(0)
const [previewPlaying, setPreviewPlaying] = useState(false)
```

**`stopPreview()`** helper (call on step change, modal close, resetToStep1):
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

**`handlePreview(result: YTSearchResult)`**:
```ts
async function handlePreview(result: YTSearchResult) {
  if (previewId === result.id) {
    // toggle play/pause
    if (audioRef.current) {
      if (previewPlaying) { audioRef.current.pause(); setPreviewPlaying(false) }
      else { audioRef.current.play(); setPreviewPlaying(true) }
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
      console.error('[preview] audio error')
      stopPreview()
    }
    await audio.play()
    setPreviewPlaying(true)
  } catch (e) {
    console.error('[handlePreview]', e)
    stopPreview()
  } finally {
    setPreviewLoading(false)
  }
}
```

**Call `stopPreview()`** in:
- `resetToStep1()`
- `handleSelectResult()` (before proceeding to step 2)
- `useEffect` that watches `showAddSong` (when modal closes)

---

## Mini player JSX (inside SearchResultCard or inline below active card)

Rendered conditionally when `previewId === result.id` (after the result card in the results list):

```tsx
{previewId === result.id && (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px',
    background: 'rgba(37,99,235,0.08)',
    border: '1px solid rgba(37,99,235,0.22)',
    borderRadius: 10,
    marginTop: 4,
  }}>
    <button
      onClick={(e) => { e.stopPropagation(); handlePreview(result) }}
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
```

Add `Play` and `Pause` to the lucide-react import in AddSongModal.

**`fmtDuration`** — reuse the same helper already defined in `SongCard.tsx`. Copy it to AddSongModal or extract to a shared util. (Simplest: copy inline since it's 4 lines.)

---

## Play button on SearchResultCard

In `SearchResultCard` component, add a play/stop icon button on the right side (visible on hover, always visible when `previewId === result.id`). Pass `onPreview`, `isPreviewing`, and `previewLoading` as props.

```tsx
type SearchResultCardProps = {
  result: YTSearchResult
  loading: boolean
  onClick: () => void
  onPreview: () => void
  isPreviewing: boolean
  previewLoading: boolean
}
```

Button style (inside the card, right side):
```tsx
<button
  onClick={(e) => { e.stopPropagation(); onPreview() }}
  style={{
    width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(37,99,235,0.4)',
    background: isPreviewing ? 'rgba(37,99,235,0.35)' : 'rgba(37,99,235,0.15)',
    color: '#60a5fa', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: hov || isPreviewing ? 1 : 0,
    transition: 'opacity 0.15s, background 0.15s',
  }}
>
  {previewLoading && isPreviewing
    ? <Loader2 size={10} className="animate-spin-smooth" />
    : isPreviewing && previewPlaying
      ? <Square size={10} fill="#60a5fa" strokeWidth={0} />
      : <Play size={10} fill="#60a5fa" strokeWidth={0} />}
</button>
```

Import `Play`, `Pause`, `Square` from lucide-react (already imports `Loader2`).

---

## Out of scope

- Preview in the URL tab (only search results)
- Seek / scrubbing the preview bar
- Volume control on the preview player
- Remembering preview position when switching results
