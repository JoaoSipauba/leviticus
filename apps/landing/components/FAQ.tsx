export default function FAQ() {
  return (
    <section className="section section-divider" id="faq" data-screen-label="faq">
      <div className="container">
        <div className="section-label">06 · Perguntas frequentes</div>
        <h2 className="section-title">As dúvidas que sempre aparecem.</h2>
        <p className="section-sub">Se algo não estiver aqui, escreve pra <a href="mailto:appleviticus@gmail.com" style={{ color: 'var(--primary-soft)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>appleviticus@gmail.com</a> que a gente responde.</p>

        <div className="faq-list">
          <details className="faq-item">
            <summary>O Leviticus é pago?</summary>
            <div className="faq-body"><p>Durante o beta, o uso é livre. No futuro, pretendemos ter um plano simbólico de manutenção pra sustentar o projeto a longo prazo — com preço acessível pra que qualquer igreja, principalmente as menores, consiga usar.</p></div>
          </details>
          <details className="faq-item">
            <summary>O que exatamente o Leviticus faz?</summary>
            <div className="faq-body"><p>Leviticus é um <strong style={{ color: 'var(--text)' }}>player desktop e organizador de repertório</strong> pra equipes de louvor. Ele centraliza as faixas que sua igreja usa, organiza por ministério, monta o setlist do culto e garante que tudo toque no domingo — mesmo sem internet. Toda a biblioteca fica no seu dispositivo.</p></div>
          </details>
          <details className="faq-item">
            <summary>Funciona mesmo sem internet?</summary>
            <div className="faq-body"><p>Sim. Depois que uma faixa está no seu repertório, ela toca offline no seu dispositivo. A sincronização com o resto da equipe acontece quando a conexão voltar.</p></div>
          </details>
          <details className="faq-item">
            <summary>Minha equipe inteira pode usar junto?</summary>
            <div className="faq-body"><p>Sim. Cada ministério tem seu próprio repertório e setlist, e toda a equipe da igreja compartilha o mesmo acervo central. Cada pessoa instala o Leviticus no seu dispositivo e entra com a conta da igreja.</p></div>
          </details>
          <details className="faq-item">
            <summary>Quais sistemas operacionais são suportados?</summary>
            <div className="faq-body"><p>Atualmente macOS (Apple Silicon — M1 ou superior) e Windows 10/11 64-bit. A versão pra iOS e Android está em desenvolvimento; você pode entrar na lista de avisos no botão "Avise-me no lançamento" da seção de download.</p></div>
          </details>
          <details className="faq-item">
            <summary>O app pede cadastro?</summary>
            <div className="faq-body"><p>Não pra baixar. A conta da igreja é criada na primeira abertura do app — é ela que permite que toda a equipe compartilhe o mesmo repertório.</p></div>
          </details>
          <details className="faq-item">
            <summary>Como reporto bugs ou sugiro funcionalidades?</summary>
            <div className="faq-body"><p>Manda email pra <a href="mailto:appleviticus@gmail.com">appleviticus@gmail.com</a>. O Leviticus está em versão inicial, então todo feedback ajuda a melhorar.</p></div>
          </details>
        </div>
      </div>
    </section>
  )
}
