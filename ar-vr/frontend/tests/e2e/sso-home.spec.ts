import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'

/**
 * Single-login journey in a real browser against a live gateway + BATISSE.
 * Needs: BATISSE on 9001, ORVYNE gateway on 8001, frontend on 5173.
 * WYA / TryOn are optional here; the test asserts the honest "not linked" state when they are down.
 */
const GATEWAY = process.env.E2E_GATEWAY ?? 'http://127.0.0.1:8001'
const PLAN = fileURLToPath(new URL('./fixtures/plan.png', import.meta.url))
const email = `e2e-${Date.now()}@example.com`
const password = 'correct-horse-1'

test.describe.configure({ mode: 'serial' })

let page: Page
const pageErrors: string[] = []

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  page.on('pageerror', e => pageErrors.push(e.message))
})
test.afterAll(async () => {
  await page.close()
})

const token = () => page.evaluate(() => localStorage.getItem('orvyne_token'))
const navState = async () => {
  const res = await page.request.get(`${GATEWAY}/api/navigation/state`, { headers: { Authorization: `Bearer ${await token()}` } })
  return res.json()
}

test('the only login: register once and land signed in', async () => {
  await page.goto('/')
  await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()
  await page.getByRole('button', { name: /Create an account/ }).click()
  await page.getByLabel('Name').fill('E2E User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  expect(await token()).toBeTruthy()
})

test('the session survives a reload without asking again', async () => {
  await page.reload()
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByRole('form', { name: 'Sign in' })).toHaveCount(0)
})

test('floor plan upload -> scale -> 3D home built from BATISSE geometry', async () => {
  await page.getByRole('link', { name: 'BATISSE' }).click()
  await expect(page.getByText('No floor plan yet')).toBeVisible()

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /Upload Floor Plan/ }).click(),
  ])
  await chooser.setFiles(PLAN)

  const scale = page.getByRole('group', { name: 'Set plan scale' })
  await expect(scale).toBeVisible({ timeout: 30000 })
  await scale.getByLabel(/longest wall/).fill('10')
  await scale.getByRole('button', { name: 'Set scale' }).click()

  await expect(page.getByText('Home generated from your floor plan')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/geometry derived · 3 rooms/)).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/home-generated.png' })
})

test('keyboard walking moves the player and the position is saved by the backend', async () => {
  const before = await navState()
  await page.getByRole('button', { name: 'Walk inside' }).click()
  await page.locator('canvas').first().hover()
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(2500)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(2600) // the save interval is 2 s

  const after = await navState()
  expect(after.saved).toBe(true)
  const moved = before.saved
    ? Math.hypot(after.position.x - before.position.x, after.position.z - before.position.z)
    : Math.hypot(after.position.x, after.position.z) // first save: compare with the default origin
  expect(moved).toBeGreaterThan(0.5)
  await page.screenshot({ path: 'test-results/walking.png' })
})

test('wardrobe page: real WYA data when linked, an honest failure when not', async () => {
  await page.getByRole('link', { name: 'WYA' }).click()
  const me = await (await page.request.get(`${GATEWAY}/api/auth/me`, { headers: { Authorization: `Bearer ${await token()}` } })).json()
  await page.getByRole('button', { name: /Browse Wardrobe/ }).click()
  if (me.services.wya === 'linked') {
    await expect(page.getByText('Your WYA wardrobe is empty.')).toBeVisible()   // a brand-new WYA account has no garments
  } else {
    await expect(page.getByRole('status')).toContainText('Wardrobe browse failed')
  }
})

test('sign out returns to the one login, and bad credentials are refused', async () => {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()
  expect(await token()).toBeNull()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid email or password')

  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText(email)).toBeVisible()
})

test('no uncaught page errors during the journey', async () => {
  expect(pageErrors).toEqual([])
})
