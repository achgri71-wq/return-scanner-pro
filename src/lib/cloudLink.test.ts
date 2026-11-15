import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCloudLinkSlot, putCloudLinkSlot } from './cloudLink'

const fetchMock = vi.fn<typeof fetch>()

describe('TextDB cloud link', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('treats an empty TextDB record as not yet published', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    await expect(getCloudLinkSlot('flow')).resolves.toBeNull()
  })

  it('reads a published slot', async () => {
    const record = { slot: 'flow', at: '2026-11-15T12:00:00.000Z', data: { distributors: [] } }
    fetchMock.mockResolvedValue(new Response(JSON.stringify(record), { status: 200 }))
    await expect(getCloudLinkSlot('flow')).resolves.toEqual(record)
  })

  it('writes snapshots as JSON text', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    await putCloudLinkSlot('rsp', { returns: {} })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/data/')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toMatchObject({ slot: 'rsp', data: { returns: {} } })
  })
})
