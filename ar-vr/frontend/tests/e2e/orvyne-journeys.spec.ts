import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test'

/**
 * Journeys through the signed-in app. Every user here is a real ORVYNE account
 * created through the gateway (there is no other way to get a session).
 * Needs the gateway on 8001 and the frontend on 5173. WYA/TryOn/VELARIS may be down.
 */
const GATEWAY = process.env.E2E_GATEWAY ?? 'http://127.0.0.1:8001'

async function createAccount(request: APIRequestContext): Promise<{ token: string; email: string }> {
  const email = `journey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const res = await request.post(`${GATEWAY}/api/auth/register`, { data: { email, password: 'correct-horse-1', full_name: 'Journey' } })
  expect(res.status()).toBe(201)
  return { token: (await res.json()).access_token, email }
}

async function openSignedIn(page: Page, token: string, path: string) {
  await page.addInitScript((t: string) => localStorage.setItem('orvyne_token', t), token)
  await page.goto(path)
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

test('Journey A: signed-in startup, WebGL context, no uncaught errors', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const { token, email } = await createAccount(request)
  await openSignedIn(page, token, '/batisse')
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20000 })
  const webgl = await page.evaluate(() => !!(document.querySelector('canvas') as HTMLCanvasElement | null)?.getContext('webgl2'))
  expect(webgl).toBe(true)
  expect(errors).toEqual([])
})

test('Journey B: first/third person toggle and walk mode', async ({ page, request }) => {
  const { token } = await createAccount(request)
  await openSignedIn(page, token, '/batisse')
  const persp = page.getByRole('button', { name: /Perspective/ })
  await expect(persp).toContainText('first')
  await persp.click()
  await expect(persp).toContainText('third')
  await page.getByRole('button', { name: 'Walk inside' }).click()
  await expect(page.getByRole('button', { name: 'Exit walk mode' })).toBeVisible()
})

test('Journey C: a new user has an empty home, not a fake one', async ({ page, request }) => {
  const { token } = await createAccount(request)
  await openSignedIn(page, token, '/batisse')
  await expect(page.getByText('No floor plan yet')).toBeVisible()
  await expect(page.getByText(/placeholder · 0 rooms/)).toBeVisible()
})

test('Journey D: wardrobe page; with WYA down the failure is shown', async ({ page, request }) => {
  const { token } = await createAccount(request)
  await openSignedIn(page, token, '/wardrobe')
  await expect(page.getByRole('button', { name: /Browse Wardrobe/ })).toBeVisible()
  // The account has no valid WYA session unless WYA was running at sign-up.
  const me = await (await request.get(`${GATEWAY}/api/auth/me`, { headers: auth(token) })).json()
  if (me.services.wya !== 'linked') {
    await page.getByRole('button', { name: /Browse Wardrobe/ }).click()
    await expect(page.getByRole('status')).toContainText('Wardrobe browse failed')
  }
})

test('Journey E: VELARIS page; generation either returns a result or fails visibly', async ({ page, request }) => {
  const { token } = await createAccount(request)
  await openSignedIn(page, token, '/jewellery')
  await page.getByRole('button', { name: /Generate Design/ }).click()
  await expect(page.getByRole('status').or(page.getByLabel('VELARIS result'))).toBeVisible({ timeout: 20000 })
})

test('Journey F: Luna companion HUD is shown in the home', async ({ page, request }) => {
  const { token } = await createAccount(request)
  await openSignedIn(page, token, '/batisse')
  await expect(page.getByText('Following You')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('Power')).toBeVisible()
})

test('Journey H: two users never see each other\'s state', async ({ browser, request }) => {
  const a = await createAccount(request)
  const b = await createAccount(request)

  // A saves a position, a room function and a furniture piece.
  await request.put(`${GATEWAY}/api/navigation/state`, { headers: auth(a.token), data: { position: { x: 7, y: 1.6, z: 9 }, room_id: 'kitchen' } })
  await request.post(`${GATEWAY}/api/integrate/assign-room-function`, { headers: auth(a.token), data: { room_id: 'r1', function: 'wardrobe' } })
  await request.post(`${GATEWAY}/api/furniture/save`, { headers: auth(a.token), data: { furniture_id: 'sofa-1', furniture_type: 'sofa', room_id: 'r1' } })

  const stateB = await (await request.get(`${GATEWAY}/api/navigation/state`, { headers: auth(b.token) })).json()
  expect(stateB.saved).toBe(false)
  expect((await (await request.get(`${GATEWAY}/api/integrate/room-assignments`, { headers: auth(b.token) })).json()).assignments).toEqual({})
  expect((await (await request.get(`${GATEWAY}/api/furniture/restore`, { headers: auth(b.token) })).json()).count).toBe(0)
  expect((await request.get(`${GATEWAY}/api/batisse/geometry`, { headers: auth(b.token) })).status()).toBe(404)

  // Two separate browser contexts show two separate sessions.
  const open = async (browser: Browser, acct: { token: string; email: string }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await openSignedIn(page, acct.token, '/')
    await expect(page.getByText(acct.email)).toBeVisible()
    return ctx
  }
  const ctxA = await open(browser, a)
  const ctxB = await open(browser, b)
  await ctxA.close()
  await ctxB.close()
})
