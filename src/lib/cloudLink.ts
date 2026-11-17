/**
 * Cross-device bridge with ColisFlow through TextDB.
 *
 * TextDB records are public to anyone who knows the URL. The records below
 * are intentionally separate from the invoice-comparison app's record.
 */
export type CloudLinkSlot = 'flow' | 'rsp'

export interface CloudLinkRecord {
  slot: CloudLinkSlot
  at: string
  data: unknown
}

const CLOUD_URLS: Record<CloudLinkSlot, string> = {
  flow: 'https://textdb.dev/api/data/43c1ffa9-74b5-4def-a9dc-9571e467ffff',
  rsp: 'https://textdb.dev/api/data/ef7d9431-5e6c-4b80-9eb2-34b05459c141',
}

// TextDB writes are slow (roughly 40 KB/s) and grow with the number of lists
// and parcels, so a fixed 8s cut-off aborted any moderately large snapshot.
// Reads are quicker than writes, but a large record still needs headroom.
const READ_TIMEOUT_MS = 30_000
const WRITE_TIMEOUT_MS = 60_000

async function cloudFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const method = (init?.method ?? 'GET').toUpperCase()
  const timeout = setTimeout(
    () => controller.abort(),
    method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS,
  )
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

/** Reads one public cloud snapshot; returns null when it has never been set. */
export async function getCloudLinkSlot(slot: CloudLinkSlot): Promise<CloudLinkRecord | null> {
  const response = await cloudFetch(`${CLOUD_URLS[slot]}?t=${Date.now()}`, { cache: 'no-store' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`TextDB read failed (${response.status})`)

  const text = (await response.text()).trim()
  if (!text) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('TextDB returned invalid JSON')
  }
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Partial<CloudLinkRecord>
  if (record.slot !== slot || typeof record.at !== 'string' || !('data' in record)) return null
  return record as CloudLinkRecord
}

/** Publishes one snapshot to the shared cloud record. */
export async function putCloudLinkSlot(slot: CloudLinkSlot, data: unknown): Promise<void> {
  const record: CloudLinkRecord = { slot, at: new Date().toISOString(), data }
  const response = await cloudFetch(CLOUD_URLS[slot], {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(record),
  })
  if (!response.ok) throw new Error(`TextDB write failed (${response.status})`)
}
