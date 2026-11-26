import { test, expect } from '@playwright/test'

/**
 * Only checks that the "Enter VR" button is offered when (and only when) the browser reports
 * WebXR support. Starting a real immersive session needs a headset and is NOT covered here.
 */
const GATEWAY = process.env.E2E_GATEWAY ?? 'http://127.0.0.1:8001'

async function signedInPage(browser: import('@playwright/test').Browser, request: import('@playwright/test').APIRequestContext, xr: boolean) {
  const email = `vr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`
  const reg = await request.post(`${GATEWAY}/api/auth/register`, { data: { email, password: 'correct-horse-1' } })
  const token = (await reg.json()).access_token
  const page = await browser.newPage()
  await page.addInitScript(([t, withXr]: [string, boolean]) => {
    localStorage.setItem('orvyne_token', t)
    // navigator.xr is a read-only accessor, so it has to be redefined.
    const stub = withXr
      ? { isSessionSupported: async (mode: string) => mode === 'immersive-vr', requestSession: async () => { throw new Error('stub') } }
      : undefined
    Object.defineProperty(navigator, 'xr', { value: stub, configurable: true })
  }, [token, xr] as [string, boolean])
  await page.goto('/batisse')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20000 })
  return page
}

test('Enter VR is offered when WebXR immersive-vr is supported', async ({ browser, request }) => {
  const page = await signedInPage(browser, request, true)
  await expect(page.getByRole('button', { name: 'Enter VR' })).toBeVisible()
  await page.close()
})

test('Enter VR is hidden when WebXR is unavailable', async ({ browser, request }) => {
  const page = await signedInPage(browser, request, false)
  await expect(page.getByRole('button', { name: 'Enter VR' })).toHaveCount(0)
  await page.close()
})
