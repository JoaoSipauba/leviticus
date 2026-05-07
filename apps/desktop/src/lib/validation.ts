// Pragmático: tem @, tem . no domínio, sem espaços. Não valida MX nem deliverability.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

// "joão da silva e maria" -> "João da Silva e Maria".
// Primeira palavra sempre capitalizada; preposições/conectivos PT-BR ficam minúsculos.
const LOWER_PT = new Set(['da', 'de', 'di', 'do', 'du', 'das', 'des', 'dos', 'e', 'y'])

export function capitalizeName(value: string): string {
  const words = value.trim().toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean)
  return words
    .map((w, i) => {
      if (i > 0 && LOWER_PT.has(w)) return w
      return w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1)
    })
    .join(' ')
}
