type Props = {
  tag: string
  title: string
  collectingSince?: string
  hint?: string
}

export default function SubsectionHead({ tag, title, collectingSince, hint }: Props) {
  return (
    <div className="subsec-head">
      <span className="tag">{tag}</span>
      <h3>{title}</h3>
      {collectingSince && (
        <span className="collecting">Coletando desde {collectingSince}</span>
      )}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}
