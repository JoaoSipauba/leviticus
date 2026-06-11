import { useEffect, useState } from 'react'
import { X, Mic } from 'lucide-react'
import { getDb } from '../lib/db.js'
import { getGroupColor, type GroupRef } from '../lib/playlist.js'
import { AnimatedModal } from './ui/AnimatedModal.js'
import { Button } from './ui/Button.js'
import { IconButton } from './ui/IconButton.js'

type Props = {
  open: boolean
  onClose: () => void
  // Quando o user confirma, chama com os dados da nova seção. O detalhe do
  // culto cuida de criar a "seção UI-only" no estado React até a 1ª música
  // ser adicionada (que é quando ela persiste no banco).
  onConfirm: (section: { sectionId: string; type: 'group' | 'avulso'; groupId: string | null; label: string }) => void
}

// gera um UUID v4 client-side (mesmo formato do randomblob do SQLite).
function newUuid(): string {
  return crypto.randomUUID()
}

type Tab = 'group' | 'avulso'

export function AddSectionModal({ open, onClose, onConfirm }: Props) {
  const [tab, setTab] = useState<Tab>('group')
  const [groups, setGroups] = useState<GroupRef[]>([])
  const [avulsoLabel, setAvulsoLabel] = useState('')

  useEffect(() => {
    if (!open) return
    setTab('group'); setAvulsoLabel('')
    void load()
  }, [open])

  async function load() {
    const orgId = localStorage.getItem('leviticus_org_id') ?? ''
    if (!orgId) return
    const db = await getDb()
    const rows = await db.select<GroupRef[]>(
      'SELECT id, name, color_index FROM groups WHERE org_id = ? ORDER BY name',
      [orgId]
    )
    setGroups(rows)
  }

  function handleGroupPick(g: GroupRef) {
    onConfirm({ sectionId: newUuid(), type: 'group', groupId: g.id, label: g.name })
    onClose()
  }
  function handleAvulsoConfirm() {
    if (!avulsoLabel.trim()) return
    onConfirm({ sectionId: newUuid(), type: 'avulso', groupId: null, label: avulsoLabel.trim() })
    onClose()
  }

  // Issue #91: clique-fora descarta na aba Ministério (nenhum dado digitado)
  // ou na aba Avulso quando o label está vazio.
  const canDismissOutside = tab === 'group' || avulsoLabel.trim() === ''

  return (
    <AnimatedModal open={open} onClose={onClose} closeOnBackdrop={canDismissOutside}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-h2 text-heading">Nova seção</h2>
          <IconButton label="Fechar" onClick={onClose} variant="ghost" size="sm"><X size={18} /></IconButton>
        </div>

        <div className="px-5 pb-4">
          <div className="inline-flex p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setTab('group')}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer ${tab === 'group' ? 'text-heading' : 'text-body'}`}
              style={tab === 'group' ? { background: 'rgba(255,255,255,0.08)' } : undefined}
            >
              Ministério
            </button>
            <button
              onClick={() => setTab('avulso')}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer ${tab === 'avulso' ? 'text-heading' : 'text-body'}`}
              style={tab === 'avulso' ? { background: 'rgba(255,255,255,0.08)' } : undefined}
            >
              Avulso
            </button>
          </div>
        </div>

        <div className="px-5 pb-5">
          <div key={tab} className="animate-fade-slide-in">
          {tab === 'group' ? (
            <div className="space-y-1.5">
              {groups.length === 0 ? (
                <p className="text-body text-sm py-4 text-center">Nenhum ministério criado ainda.</p>
              ) : (
                groups.map((g) => {
                  const c = getGroupColor(g.color_index)
                  return (
                    <button
                      key={g.id}
                      onClick={() => handleGroupPick(g)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] cursor-pointer text-left"
                    >
                      <span className="w-8 h-8 rounded-lg" style={{ background: c.bg }} />
                      <span className="text-heading text-sm font-semibold flex-1">{g.name}</span>
                    </button>
                  )
                })
              )}
            </div>
          ) : (
            <div>
              <label className="block">
                <span className="text-body text-xs uppercase tracking-wide font-semibold">Nome da seção</span>
                <div className="relative mt-1">
                  <Mic size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={avulsoLabel}
                    onChange={(e) => setAvulsoLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAvulsoConfirm() }}
                    placeholder="Ex.: Cantora Maria, Solo Pastor João…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-heading text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    autoFocus
                  />
                </div>
              </label>
              <Button
                onClick={handleAvulsoConfirm}
                disabled={!avulsoLabel.trim()}
                fullWidth
                style={{ marginTop: 12 }}
              >
                Criar seção
              </Button>
            </div>
          )}
          </div>
        </div>
    </AnimatedModal>
  )
}
