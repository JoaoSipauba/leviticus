# Projeção de Crescimento e Custo de Infra — Leviticus

| | |
|---|---|
| **Horizonte** | 12 meses (mai/2026 → mai/2027) |
| **Base de dados** | Supabase produção, puxado em 22/05/2026 |
| **Modelo** | 3 cenários (conservador / base / otimista) |
| **Autor** | João Sipauba |

> **Aviso de confiabilidade.** O projeto tem 14 dias de vida (criado em
> 08/05/2026). 14 dias não formam uma curva — qualquer projeção aqui é um
> exercício de cenários, não uma previsão. O valor do documento está em
> identificar **quando e por que** os custos aparecem, não no número exato de
> igrejas no mês 12. Revisar quando houver ~90 dias de dados reais.

---

## 1. Retrato de hoje (22/05/2026)

| Métrica | Valor | Observação |
|---|---|---|
| Igrejas (orgs) | 8 | 8 criadas em 14 dias |
| Usuários (auth) | 8 | 1 conta por igreja — nenhum time montado ainda |
| Músicas | 65 | 19 criadas só em 22/05 (provável carga de teste) |
| Cultos (playlists) | 9 | — |

Ritmo bruto de igrejas: ~0,5/dia (~15/mês). Esse número está inflado pela
rede pessoal do fundador e por contas de teste — não é orgânico sustentável.
As projeções abaixo assumem que esse ritmo inicial **não** se mantém sozinho.

### Onde os dados moram (e o que custa)

- **Postgres (Supabase)** — metadados: igrejas, usuários, músicas, cultos.
  Minúsculo. Áudio **não** fica aqui.
- **Áudio das músicas** — Google Drive do próprio usuário. Custo zero pra
  infra do Leviticus; escala com o usuário, não com a gente.
- **Storage `app-releases` (Supabase)** — bundles do desktop (`.dmg`,
  `.app.tar.gz`, `.exe`) que o auto-updater baixa. **Este é o real centro de
  custo.**
- **Landing** — Vercel Hobby (free).
- **Erros** — Sentry Developer (free).

---

## 2. Premissas do modelo

| Premissa | Valor | Racional |
|---|---|---|
| Usuários por igreja (M12) | 2 / 3 / 4 | Times de louvor pequenos; cresce devagar |
| Músicas por igreja (steady) | ~25–30 | Acervo de um repertório de igreja típico |
| Installs do desktop | ≈ nº de usuários | 1 instalação por pessoa |
| Releases por mês (steady) | 3 | Hoje o ritmo é ~1,6/dia (churn de dev inicial); cai ao estabilizar |
| Tamanho de 1 release no storage | ~27,4 MB | `.app.tar.gz` 10,4 + `.dmg` 10,1 + `.exe` 7,0 |
| Releases retidas no storage | 3 | Versões antigas podadas; storage fica fixo em ~82 MB |
| Download de update por install | ~9 MB | macOS baixa `.app.tar.gz` (~10,4); Windows o `.exe` (~7) |

**Crescimento de igrejas (composto, mês a mês):**

- **Conservador** — boca a boca, zero marketing. ~+4 igrejas/mês.
- **Base** — divulgação leve na comunidade de louvor. ~12% a.m.
- **Otimista** — tração na comunidade, indicação compondo. ~19% a.m.

---

## 3. Projeção de crescimento — 12 meses

Marcos trimestrais (M0 = hoje, M12 = mai/2027).

### Cenário Conservador

| | M0 | M3 | M6 | M9 | M12 |
|---|---|---|---|---|---|
| Igrejas | 8 | 20 | 32 | 44 | 56 |
| Usuários | 8 | 28 | 55 | 85 | 110 |
| Músicas | 65 | 450 | 850 | 1.150 | 1.400 |
| Installs | 8 | 28 | 55 | 85 | 110 |

### Cenário Base

| | M0 | M3 | M6 | M9 | M12 |
|---|---|---|---|---|---|
| Igrejas | 8 | 35 | 65 | 105 | 150 |
| Usuários | 8 | 70 | 180 | 320 | 450 |
| Músicas | 65 | 900 | 2.000 | 3.300 | 4.500 |
| Installs | 8 | 70 | 180 | 320 | 450 |

### Cenário Otimista

| | M0 | M3 | M6 | M9 | M12 |
|---|---|---|---|---|---|
| Igrejas | 8 | 55 | 130 | 250 | 400 |
| Usuários | 8 | 140 | 450 | 950 | 1.600 |
| Músicas | 65 | 1.600 | 4.000 | 8.000 | 12.000 |
| Installs | 8 | 140 | 450 | 950 | 1.600 |

---

## 4. Gatilhos de custo — quando o free tier estoura

Limites relevantes hoje:

| Serviço | Plano free | Limite que importa |
|---|---|---|
| Supabase | Free $0 | **1 GB storage**, **5 GB egress/mês**, 500 MB DB, 50k MAU |
| Vercel | Hobby $0 | 100 GB banda/mês |
| Sentry | Developer $0 | 5k erros/mês, 1 usuário |

### 4.1. Storage de releases — resolvido por política de retenção

Decisão adotada: **manter apenas as 3 releases mais recentes** no bucket
`app-releases` (cada release = os 3 arquivos de plataforma). O updater do
Tauri só baixa a versão mais nova apontada pelo `latest.json` — versões
intermediárias não são necessárias; reter 3 é só margem pra rollback.

Com isso o storage fica **fixo em ~82 MB** (3 × 27,4 MB + arquivos de
manifesto), **independente da cadência de release e do nº de usuários**.
Nunca chega perto de 1 GB. O storage **deixa de ser um gatilho de custo**.

> Estado atual: ~630 MB / 23 versões. Ao aplicar a poda, cai pra ~82 MB.

### 4.2. Egress — o único gatilho restante, dirigido por adoção

Egress mensal ≈ `installs × releases/mês × 9 MB`. O check de `latest.json` é
desprezível (~1 KB). Projeção do egress mensal no M12:

| Cenário | Installs M12 | Egress/mês M12 | Estoura 5 GB free? |
|---|---|---|---|
| Conservador | 110 | ~3,0 GB | Não — fica no free o ano todo |
| Base | 450 | ~12 GB | Sim, por volta do **M7–M8** |
| Otimista | 1.600 | ~43 GB | Sim, por volta do **M5–M6** |

### 4.3. O que **não** vira problema em 12 meses

- **DB Postgres** — só metadados (áudio está no Drive). Mesmo no otimista,
  ~12k músicas = poucos MB. Longe dos 500 MB.
- **MAU** — otimista chega a 1.600. Limite é 50.000.
- **Vercel** — tráfego da landing minúsculo perto de 100 GB.
- **Sentry** — 5k erros/mês cobre bem um app desktop pequeno.

Conclusão: o único serviço que sai do free em 12 meses é o **Supabase**.

---

## 5. Projeção de custo

Quando o Supabase precisa sair do free, o destino é o **Pro: $25/mês** (8 GB
DB, 100 GB storage, 250 GB egress inclusos). O egress do otimista (43 GB/mês)
cabe folgado nos 250 GB do Pro — ou seja, o custo é **degrau único**, não
escalonado.

| Cenário | Free até | Custo mensal pós-degrau | **Total ano 1 (infra)** |
|---|---|---|---|
| Conservador | o ano todo | $0 | **$0** |
| Base | ~M8 | $25/mês | **~$100–125** (5 meses de Pro) |
| Otimista | ~M6 | $25/mês | **~$150–175** (7 meses de Pro) |

Com a retenção de 3 releases (§4.1), o **egress é o único gatilho** — e ele
depende de adoção. O conservador não estoura o free em 12 meses.

### Custos fixos fora de infra (não escalam, mas existem)

| Item | Custo | Situação |
|---|---|---|
| Domínio `leviticus.app.br` | ~R$40/ano | Já pago |
| Apple Developer Program | US$99/ano | **Não contratado.** App usa `codesign` ad-hoc → usuário vê aviso do Gatekeeper na instalação. Vale contratar quando a fricção de instalação virar problema de adoção. |
| Certificado de assinatura Windows | ~US$100–200/ano | **Não contratado.** `.exe` sem assinatura → aviso do SmartScreen. Mesma lógica. |

Esses dois últimos são custos de **qualidade de distribuição**, dirigidos por
adoção (quanto mais gente instala, mais o aviso dói), não por escala de infra.

---

## 6. Recomendações

1. **Implementar a poda de releases (decisão tomada, custo zero).** Adicionar
   ao workflow de release um passo que mantém só as 3 versões mais recentes no
   bucket `app-releases` e remove as antigas. Isso fixa o storage em ~82 MB e
   neutraliza o §4.1 de forma permanente. Pendência de execução — abrir issue
   `type:dx`.

2. **Não antecipar o Supabase Pro.** No cenário conservador ele nunca é
   necessário. Migrar só quando o egress real cruzar ~4 GB/mês — monitorável
   no próprio painel do Supabase.

3. **Reduzir a cadência de release ao estabilizar.** Hoje são ~1,6
   releases/dia (churn normal de início). Cada release custa 27,4 MB de
   storage e `installs × 9 MB` de egress. Quando o app amadurecer, agrupar
   correções em menos releases corta os dois custos de uma vez.

4. **Revisar este documento em ~ago/2026** (90 dias de dados). Aí dá pra
   trocar os cenários por uma curva ajustada de verdade.

5. **Tratar Apple Developer / assinatura Windows como decisão de adoção,**
   não de infra. Contratar quando houver sinal de que o aviso de instalação
   está custando cadastros — não antes.

### Resumo de uma linha

> Em 12 meses o Leviticus provavelmente custa **entre $0 e ~$175 de infra**.
> Com a retenção de 3 releases, o storage some como gatilho de custo e o
> egress do updater vira o único. O free tier do Supabase aguenta o ano
> inteiro no cenário conservador; nos demais, vira **$25/mês fixo** a partir
> do 2º semestre.
