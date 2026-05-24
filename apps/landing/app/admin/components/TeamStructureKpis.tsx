import type { TeamStructureData } from '@/lib/adminProduto'
import KpiCard from './KpiCard'

type Props = {
  data: TeamStructureData
}

export default function TeamStructureKpis({ data }: Props) {
  return (
    <div className="kpi-grid">
      <KpiCard
        label="Novos membros"
        value={data.newMembers}
        kind="flow"
        delta={data.newMembersDelta}
        deltaFormat="abs"
        context="organization_members.joined_at"
      />
      <KpiCard
        label="Tamanho médio de equipe"
        value={data.avgTeamSize}
        kind="snapshot"
        context="membros / igreja"
      />
      <KpiCard
        label="Ministérios criados"
        value={data.newGroups}
        kind="snapshot"
        delta={data.newGroupsDelta}
        deltaFormat="abs"
        context="no período"
      />
      <KpiCard
        label="Convites gerados"
        value={data.newInvites}
        kind="flow"
        delta={data.newInvitesDelta}
        deltaFormat="abs"
        context="no período"
      />
    </div>
  )
}
