// Renderer-only module: relies on localStorage. Do not import in the main process or Node test runners.
const DEVICE_ID_KEY = 'leviticus_device_id'
const DEVICE_NAME_KEY = 'leviticus_device_name'

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

// Persists the generated name on first call so it stays stable across reloads.
export function getDeviceName(): string {
  let name = localStorage.getItem(DEVICE_NAME_KEY)
  if (!name) {
    name = `Desktop ${new Date().toLocaleDateString('pt-BR')}`
    localStorage.setItem(DEVICE_NAME_KEY, name)
  }
  return name
}

export function setDeviceName(name: string): void {
  localStorage.setItem(DEVICE_NAME_KEY, name)
}
