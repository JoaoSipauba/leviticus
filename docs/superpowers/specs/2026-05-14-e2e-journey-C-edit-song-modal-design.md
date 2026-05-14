# E2E Journey C — Edit Song Modal Design

## Goal

Cover the EditSongModal — currently has ZERO E2E coverage. Hits the most critical "post-add" flow: editing metadata and deleting songs from the Library.

Maps to gap items 11-15 in the audit.

---

## Scope

**In:** 2 tests in `11-edit-song.spec.ts`.

| # | Test | Path | Expected |
|---|---|---|---|
| T1 | Edit title + save | Add song; click edit on SongCard; change title; save | SQL row has new title |
| T2 | Delete song | Edit modal → click Excluir (or Trash icon) → confirm | SQL row deleted; file removed from disk |

**Out:** Change ministries inside edit (use Journey B for the create-path), change song_type (Journey B), empty title validation (low value), offline save (low value).

---

## Setup pattern

Outer `before()`:
- `cleanLocalSqlite + installYtDlpMock + signupAndCreateOrg`
- Add ONE song via the AddSongModal flow (reuse the proven pattern from journey #2 T1)
- Wait for SongCard to render

T1 and T2 share the seeded song — but T2 deletes it, so T2 runs SECOND. After T2 deletes, the test session ends; we don't need to add another for the run.

---

## Test details

### T1 — Edit title

The SongCard exposes an edit button on hover. In WebDriver, hover isn't reliable — but the button itself is in the DOM (hidden via CSS opacity, not display:none). Verify the actual selector by inspecting SongCard.tsx.

Likely selector: `button[aria-label*="Editar"]` or similar. If aria-label is not present, fall back to looking for the Pencil icon by some other means.

```
T1 it:
  - Find the edit button on the SongCard (selector TBD-by-inspection)
  - Click → EditSongModal opens with input#title pre-filled with current title
  - setReactInputValue on input#title with a new title
  - Click "Salvar" button
  - Wait for modal to close (button no longer exists)
  - Poll songs row → assert title === new title
```

### T2 — Delete song

EditSongModal has a delete UI. Looking at [EditSongModal.tsx](apps/desktop/src/components/EditSongModal.tsx) for the actual mechanism — probably a Trash2 icon button + a confirm step.

```
T2 it:
  - Open edit modal again (re-find SongCard, click edit)
  - Find the delete trigger (likely button with Trash2 icon or text "Excluir")
  - If a window.confirm pops up: stubConfirm(true) before click
  - Click delete
  - Wait for modal to close
  - Poll for ABSENCE of songs row (5s timeout)
  - Assert audio file deleted from disk (file at appAudioDir/<songId>.m4a should not exist)
```

---

## Selectors to verify before writing the spec implementation

Quick inspect needed for:
- SongCard edit button: aria-label or text
- EditSongModal delete button: text, icon, or aria-label
- Whether delete uses `window.confirm` (then `stubConfirm` needed) or an inline modal

This inspection happens at implementation time. Adjust the spec test accordingly.

---

## Files changed

| File | Action |
|---|---|
| `apps/desktop/e2e/specs/11-edit-song.spec.ts` | CREATE |

No new helpers (all flows use existing ones; `stubConfirm` is already there if delete uses native confirm).

---

## Risks

- **Edit button is hover-only in UI**: CSS opacity:0 on un-hovered. WebdriverIO `.click()` should still trigger the click even if visually hidden, as long as element is in DOM and not display:none. If pointer events are blocked, may need `browser.execute(() => button.click())` as fallback.
- **Delete might trigger a re-render that unmounts the SongCard** before the modal close transition completes. Poll for SQL absence (more reliable) instead of waiting for DOM state.

---

## Out of scope
- Cancel button (just dismisses modal).
- Multi-ministry binding via the edit modal (Journey B covers create-path; same UI code on edit).
- Validation errors (empty title).
