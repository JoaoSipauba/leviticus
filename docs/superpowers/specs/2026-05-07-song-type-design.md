# Song Type Design

## Goal

Add a `song_type` field to songs so users can categorize each song during registration (and editing). The category is always exactly one value. It appears as a color-coded pill in the Library card.

---

## Categories (fixed enum)

| Value | Label | Color | Icon | Meaning |
|---|---|---|---|---|
| `normal` | Normal | Gray | Music note | Full version with vocals + instruments |
| `playback` | Playback | Blue | Headphones | No vocals, instrumental backing track |
| `instrumental` | Instrumental | Purple | Piano keyboard | Instruments only, no lyrics |
| `vs` | VS | Orange | Microphone | Voz e Suporte — lead vocal guide + backing |

---

## Architecture

### Database changes

**Supabase migration** (`supabase/migrations/20260507000001_song_type.sql`):
```sql
ALTER TABLE songs
  ADD COLUMN song_type TEXT NOT NULL DEFAULT 'normal'
  CHECK (song_type IN ('normal', 'playback', 'instrumental', 'vs'));
```

**SQLite migration** (`apps/desktop/src-tauri/migrations/003_song_type.sql`):
```sql
ALTER TABLE songs ADD COLUMN song_type TEXT NOT NULL DEFAULT 'normal';
```
SQLite does not support CHECK constraints in ALTER TABLE; constraint enforced at app level.

### TypeScript type (`packages/core/src/types/song.ts`)

Add to `Song`:
```ts
song_type: 'normal' | 'playback' | 'instrumental' | 'vs'
```

### Sync (`apps/desktop/src/lib/sync.ts`)

Add `song_type` to the INSERT column list and values array in `syncOrg`.

### SongCard (`apps/desktop/src/components/SongCard.tsx`)

**New layout (Layout C):**
- Thumbnail (44×44) — unchanged
- Body (flex-1):
  - Top row: title (truncated, flex-1) + duration (right, 13px, `#6b7280`)
  - Middle: artist (11px, `#6b7280`)
  - Bottom: `SongTypePill` component
- Right: play/download + edit buttons on hover — unchanged

**`SongTypePill` component** (defined in `SongCard.tsx`):
- Renders a colored pill with icon + label
- Props: `type: Song['song_type']`
- Icons (lucide-react):
  - `normal` → `Music` icon, gray (`#9ca3af`)
  - `playback` → `Headphones` icon, blue (`#60a5fa`)
  - `instrumental` → custom piano SVG inline, purple (`#a78bfa`)
  - `vs` → `Mic` icon, orange (`#fb923c`)
- Styles per type (background, color, border) — match mockup palette

### AddSongModal step 2 (`apps/desktop/src/components/AddSongModal.tsx`)

Add:
- `songType` state: `'normal' | 'playback' | 'instrumental' | 'vs'`, default `'normal'`
- Type selector section (label "Tipo") placed between the ministry chips and the download button
- Same chip style as ministry selector but single-select
- `songType` included in Supabase insert payload
- `resetToStep1` resets `songType` to `'normal'`

### Edit song modal (`apps/desktop/src/components/EditSongModal.tsx`)

- Add `songType` state initialised from `song.song_type`
- Add the same type selector UI
- Include `song_type` in the Supabase update payload

---

## Files changed

| File | Action |
|---|---|
| `supabase/migrations/20260507000001_song_type.sql` | CREATE — new Supabase migration |
| `apps/desktop/src-tauri/migrations/003_song_type.sql` | CREATE — new SQLite migration |
| `packages/core/src/types/song.ts` | MODIFY — add `song_type` field |
| `apps/desktop/src/lib/sync.ts` | MODIFY — include `song_type` in INSERT |
| `apps/desktop/src/components/SongCard.tsx` | MODIFY — new layout + SongTypePill |
| `apps/desktop/src/components/AddSongModal.tsx` | MODIFY — type selector in step 2 + insert payload |
| `apps/desktop/src/components/EditSongModal.tsx` | MODIFY — type selector + update payload |

---

## Out of scope

- Filtering/searching by type in the Library
- Custom user-defined types
- Type visible in PlaylistDetail or GroupDetail song lists (future)
