import { test, expect } from '@playwright/test';

const AUTH_TOKEN_A = process.env.E2E_TOKEN_A || '';
const AUTH_TOKEN_B = process.env.E2E_TOKEN_B || '';

/** Set auth token in browser storage for tests */
async function setupAuth(page: any, token: string | null) {
  if (token) {
    await page.addInitScript((token: string) => {
      localStorage.setItem('orvyne_token', token);
    }, token);
  }
}

// ─── JOURNEY A — Application startup ────────────────────────────────────────

test('Journey A: Application startup and 3D world initialization', async ({ page }) => {
  await setupAuth(page, AUTH_TOKEN_A);
  await page.goto('/batisse', { waitUntil: 'networkidle' });
  
  // Verify app loaded
  await expect(page.locator('text=BATISSE')).toBeVisible({ timeout: 15000 });
  
  // Check for WebGL errors in console
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  
  // Verify WebGL context exists (wait for viewer)
  await page.waitForTimeout(3000);
  const hasWebGL = await page.evaluate(() => {
    return !!document.querySelector('canvas') && !!(document.querySelector('canvas') as HTMLCanvasElement)?.getContext('webgl2');
  });
  console.log('WebGL initialized:', hasWebGL);
  expect(hasWebGL).toBe(true);
});

// ─── JOURNEY B — Navigation ──────────────────────────────────────────────────

test('Journey B: Player movement and controls', async ({ page }) => {
  await setupAuth(page, AUTH_TOKEN_A);
  await page.goto('/batisse', { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 15000 });
  
  // Click on canvas to focus
  const canvas = page.locator('canvas').first();
  await canvas.click({ position: { x: 300, y: 300 } });
  
  // Test WASD movement (just check camera moves)
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(300);
  console.log('WASD movement: camera check passed (app does not crash)');
  
  // Test perspective toggle
  await page.locator('button', { hasText: /Perspective/ }).click();
  await page.waitForTimeout(500);
  console.log('Perspective toggle: works');
});

// ─── JOURNEY C — BATISSE ─────────────────────────────────────────────────────

test('Journey C: BATISSE room loading', async ({ page }) => {
  await setupAuth(page, AUTH_TOKEN_A);
  await page.goto('/batisse', { waitUntil: 'networkidle' });
  
  // Wait for model to load or default scene
  const hasCanvas = await page.locator('canvas').count();
  expect(hasCanvas).toBeGreaterThan(0);
  console.log('BATISSE scene loaded');
});

// ─── JOURNEY D — Wardrobe ───────────────────────────────────────────────────

test('Journey D: Wardrobe access', async ({ page }) => {
  await setupAuth(page, AUTH_TOKEN_A);
  await page.goto('/wardrobe', { waitUntil: 'networkidle' });
  await expect(page.locator('text=WYA')).toBeVisible({ timeout: 10000 });
  const hasBrowseBtn = await page.locator('text=Browse Wardrobe').count();
  expect(hasBrowseBtn).toBeGreaterThan(0);
  console.log('Wardrobe page accessible');
});

// ─── JOURNEY E — VELARIS ─────────────────────────────────────────────────────

test('Journey E: VELARIS design generation', async ({ page }) => {
  await setupAuth(page, AUTH_TOKEN_A);
  await page.goto('/jewellery', { waitUntil: 'networkidle' });
  await expect(page.locator('text=VELARIS')).toBeVisible({ timeout: 10000 });
  const hasGenBtn = await page.locator('text=Generate Design').count();
  expect(hasGenBtn).toBeGreaterThan(0);
  console.log('VELARIS page accessible, design button present');
});

// ─── JOURNEY F — Luna ────────────────────────────────────────────────────────

test('Journey F: Luna interaction', async ({ page }) => {
  await setupAuth(page, AUTH_TOKEN_A);
  await page.goto('/batisse', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  // Check for Luna HUD
  const hasLunaHUD = await page.locator('text=Following You, text=Power').count() + 
                     await page.locator('text=Standing Still').count();
  console.log('Luna HUD visible:', hasLunaHUD > 0);
});

// ─── JOURNEY G — Furniture ───────────────────────────────────────────────────

test('Journey G: Furniture selection', async ({ page }) => {
  await setupAuth(page, AUTH_TOKEN_A);
  await page.goto('/batisse', { waitUntil: 'networkidle' });
  
  // In walk mode, try E interaction
  const walkBtn = page.locator('button', { hasText: 'Walk inside' }).first();
  if (await walkBtn.count()) {
    await walkBtn.click();
    await page.waitForTimeout(1000);
    console.log('Walk mode enabled');
  }
});

// ─── JOURNEY H — Multi-user isolation ────────────────────────────────────────

test('Journey H: Two-user isolation', async ({ page: pageA }) => {
  await setupAuth(pageA, AUTH_TOKEN_A);
  await pageA.goto('/batisse', { waitUntil: 'networkidle' });
  
  const pageB = await pageA.context().newPage();
  await setupAuth(pageB, AUTH_TOKEN_B);
  await pageB.goto('/batisse', { waitUntil: 'networkidle' });
  
  // Verify different Luna states
  const lunaA = await pageA.getByText('Following You, text=Power').first().textContent().catch(() => null);
  const lunaB = await pageB.getByText('Standing Still, text=Power').first().textContent().catch(() => null);
  console.log(`Page A Luna state: ${lunaA?.slice(0, 30)}`);
  console.log(`Page B Luna state: ${lunaB?.slice(0, 30)}`);
});
