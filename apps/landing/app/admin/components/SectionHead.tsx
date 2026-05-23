type Props = {
  num: string
  title: string
  question: string
  source: string
}

export default function SectionHead({ num, title, question, source }: Props) {
  return (
    <div className="section-head">
      <div className="left">
        <span className="num">{num}</span>
        <h2>{title}</h2>
        <span className="question">{question}</span>
      </div>
      <span className="source">{source}</span>
    </div>
  )
}
