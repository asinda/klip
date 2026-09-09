import { describe, it, expect, vi, afterEach } from 'vitest'
import { getLinkedInAuthUrl, exchangeLinkedInCode, getLinkedInOrgInfo, refreshLinkedInToken } from './oauth'

describe('getLinkedInAuthUrl', () => {
  it('builds the authorization URL with the requested scope and state', () => {
    process.env.LINKEDIN_CLIENT_ID = 'client-abc'
    process.env.LINKEDIN_REDIRECT_URI = 'http://localhost:3000/api/auth/linkedin/callback'

    const url = getLinkedInAuthUrl('state-123')

    expect(url).toContain('https://www.linkedin.com/oauth/v2/authorization?')
    expect(url).toContain('client_id=client-abc')
    expect(url).toContain('scope=w_organization_social')
    expect(url).toContain('state=state-123')
    expect(url).toContain(encodeURIComponent('http://localhost:3000/api/auth/linkedin/callback'))
  })
})

describe('exchangeLinkedInCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts to the token endpoint and returns the parsed tokens', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok-abc', expires_in: 5184000 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await exchangeLinkedInCode('auth-code-123')

    expect(result).toEqual({ access_token: 'tok-abc', expires_in: 5184000 })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://www.linkedin.com/oauth/v2/accessToken')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
  })

  it('throws when the token exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Bad Request' }))

    await expect(exchangeLinkedInCode('bad-code')).rejects.toThrow('LinkedIn token exchange failed')
  })
})

describe('getLinkedInOrgInfo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the first administered organization the token grants access to', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          elements: [
            {
              organization: 'urn:li:organization:98765',
              'organization~': { localizedName: 'Klip Agency', logoV2: { original: 'https://media.licdn.com/logo.png' } },
            },
          ],
        }),
      })
    )

    const info = await getLinkedInOrgInfo('tok-abc')

    expect(info).toEqual({ organizationId: '98765', name: 'Klip Agency', logoUrl: 'https://media.licdn.com/logo.png' })
  })

  it('throws when no administered organization is found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) }))

    await expect(getLinkedInOrgInfo('tok-abc')).rejects.toThrow('No administered LinkedIn organization found')
  })
})

describe('refreshLinkedInToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts a refresh_token grant and returns the new access token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok-refreshed', expires_in: 5184000 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await refreshLinkedInToken('refresh-abc')

    expect(result).toEqual({ access_token: 'tok-refreshed', expires_in: 5184000 })
    const body = mockFetch.mock.calls[0][1].body as URLSearchParams
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('refresh-abc')
  })

  it('throws when the refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Unauthorized' }))

    await expect(refreshLinkedInToken('bad-refresh')).rejects.toThrow('LinkedIn token refresh failed')
  })
})
