# Doação no app — design

Data: 2026-05-20

## Contexto

Hoje a doação existe só na landing (`apps/landing`): uma seção `#doacao` com QR
code PIX + chave copiável, valor livre. PIX no Brasil não tem débito automático
nem webhook de confirmação, então qualquer "doação mensal" no app é
necessariamente um **lembrete/nudge**, nunca uma cobrança automática.

O Leviticus é gratuito. O objetivo é ajudar o usuário a lembrar de doar
mensalmente sem atrapalhar a experiência.

## Decisões

- **Mecanismo**: banner discreto que aparece 1x/mês no topo da área de conteúdo.
- **Destino**: clicar abre `https://leviticus.app.br/#doacao` no navegador
  externo. O app não duplica QR code / chave PIX.
- **Acesso fixo**: link discreto "Apoiar o Leviticus" no rodapé da sidebar,
  sempre visível.
- **Estilo do banner**: faixa horizontal compacta (ícone + 2 linhas de texto +
  botão "Apoiar" + X de dispensar).
- **Animação**: entrada com slide-down suave + ícone coração com loop sutil de
  batida pra chamar atenção.
- **Carência**: 3 dias após o primeiro uso antes do banner aparecer pela
  primeira vez — evita pedir doação a quem acabou de instalar.
- **Sem rastreio de "já doei"**: PIX não confirma; é honra. O banner some pelo
  mês quando o usuário clica "Apoiar" ou dispensa.
- **Culto ao vivo não é tratado**: o banner é uma faixa passiva (não interrompe
  áudio, não abre modal), então aparece normalmente mesmo durante culto.

## Componentes

### 1. `src/lib/donation.ts` — lógica pura

Função pura testável que decide se o banner deve aparecer:

```ts
shouldShowDonationBanner(firstSeen: string | null, handledMonth: string | null, now: Date): boolean
```

Regras:
- Se `firstSeen` é `null` → `false` (ainda não houve 1º boot registrado nesta run).
- Se `now - firstSeen < 3 dias` → `false` (carência).
- Se `monthKey(now) === handledMonth` → `false` (já tratado neste mês).
- Caso contrário → `true`.

Helpers:
- `monthKey(date): string` → `YYYY-MM`.
- Constante `DONATION_URL = 'https://leviticus.app.br/#doacao'`.

Chaves de `localStorage`:
- `leviticus_donate_first_seen` — ISO date, gravada no 1º boot se ainda não existir.
- `leviticus_donate_handled_month` — `YYYY-MM` do último mês em que o usuário
  clicou "Apoiar" ou dispensou.

### 2. `src/components/DonationBanner.tsx` — componente novo

- No mount: garante `leviticus_donate_first_seen` (grava `now` se ausente);
  calcula visibilidade via `shouldShowDonationBanner`.
- Renderiza a faixa horizontal compacta quando visível. `null` quando não.
- Botão "Apoiar": chama `open(DONATION_URL)` de `@tauri-apps/plugin-shell`,
  grava `handled_month`, oculta o banner.
- Botão X: grava `handled_month`, oculta o banner.
- Falha ao abrir URL: `console.error` + `captureException` + `toastError`.

Estilo: faixa com fundo gradiente rosa/azul sutil, borda rosa translúcida,
ícone coração em quadrado arredondado, texto em 2 linhas, botão primário rosa
(`#db2777`), X discreto. Coerente com o tema escuro do app.

Texto:
- Título: "O Leviticus é gratuito — e segue assim."
- Sub: "Se ele tem abençoado sua equipe, considere apoiar o projeto este mês."

### 3. `src/index.css` — animações novas

No mesmo estilo das existentes (durações curtas, easing `cubic-bezier`):

```css
@keyframes banner-in {
  from { opacity: 0; transform: translateY(-14px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes heart-beat {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.18); }
}
.animate-banner-in { animation: banner-in 0.28s cubic-bezier(0.34,1.25,0.64,1) both; }
.animate-heart-beat { animation: heart-beat 1.6s ease-in-out infinite; }
```

### 4. `src/components/Layout.tsx` — integração

Renderiza `<DonationBanner />` dentro da coluna de conteúdo, acima do `<main>`:

```tsx
<div className="flex-1 flex flex-col overflow-hidden">
  <DonationBanner />
  <main className="flex-1 overflow-y-auto styled-scroll">{children}</main>
  <PlayerMini />
</div>
```

### 5. `src/components/Sidebar.tsx` — link fixo

Item "Apoiar o Leviticus" no rodapé (antes de "Sair"), ícone `Heart` da
lucide-react em tom rosa, hover sutil. Ação: `open(DONATION_URL)`.

## Testes

- **Unit** (`src/lib/donation.test.ts`): `shouldShowDonationBanner` —
  carência de 3 dias, virada de mês, mesmo mês já tratado, `firstSeen` nulo;
  `monthKey`.
- **Component** (`src/components/DonationBanner.test.tsx`): renderiza quando
  storage permite; não renderiza dentro da carência / mês já tratado; X grava
  `handled_month` e oculta; "Apoiar" chama `open` mockado e grava mês.
- **Component** (`src/components/Sidebar.test.tsx`): atualizar — novo link
  "Apoiar o Leviticus" presente e chama `open`.

Mock de `@tauri-apps/plugin-shell` via `vi.mock`.

## Fora de escopo

- Confirmação de doação / rastreio de quem doou.
- QR code / chave PIX dentro do app.
- Opt-in / configuração de lembrete.
- Recorrência automática (PIX não suporta).
