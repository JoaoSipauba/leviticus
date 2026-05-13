function field(id: string, value: string): string {
  return id + value.length.toString().padStart(2, '0') + value
}

function crc16ccitt(str: string): number {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1)
      crc &= 0xffff
    }
  }
  return crc
}

export function buildPixPayload(key: string, name: string, city: string): string {
  const minfo = field('00', 'br.gov.bcb.pix') + field('01', key)
  let payload =
    field('00', '01') +
    field('26', minfo) +
    field('52', '0000') +
    field('53', '986') +
    field('58', 'BR') +
    field('59', name.substring(0, 25)) +
    field('60', city.substring(0, 15)) +
    field('62', field('05', '***')) +
    '6304'
  const crc = crc16ccitt(payload)
  return payload + crc.toString(16).toUpperCase().padStart(4, '0')
}
