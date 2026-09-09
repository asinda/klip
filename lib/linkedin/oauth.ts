const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
// Note (non vérifié contre la doc live — candidature partenaire pas encore obtenue) :
// endpoint pour lister les organisations qu'un membre administre, avec projection
// pour récupérer le nom/logo de l'organisation référencée dans le même appel.
// À confirmer une fois l'accès "Community Management API" obtenu.
const ORG_INFO_URL =
  'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(localizedName,logoV2)))'

export function getLinkedInAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
    scope: 'w_organization_social',
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

export async function exchangeLinkedInCode(code: string): Promise<{
  access_token: string
  refresh_token?: string
  expires_in: number
}> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) throw new Error(`LinkedIn token exchange failed: ${res.statusText}`)
  return res.json()
}

export async function getLinkedInOrgInfo(
  accessToken: string
): Promise<{ organizationId: string; name: string; logoUrl?: string }> {
  const res = await fetch(ORG_INFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch LinkedIn organization info')

  const json = await res.json()
  const first = json.elements?.[0]
  if (!first) throw new Error('No administered LinkedIn organization found')

  const organizationId = (first.organization as string).replace('urn:li:organization:', '')
  const orgDetails = first['organization~']

  return {
    organizationId,
    name: orgDetails.localizedName,
    logoUrl: orgDetails.logoV2?.original,
  }
}

export async function refreshLinkedInToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) throw new Error('LinkedIn token refresh failed')
  return res.json()
}
