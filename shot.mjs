import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch()
for (const [name, w, h] of [['desktop',1280,900], ['mobile',390,844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  await p.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' })
  await p.screenshot({ path: `${out}/signin-${name}.png` })
  // Get to the chat: sign in as the patient.
  const texts = await p.locator('button, a').allInnerTexts()
  console.log(name, 'controls on sign-in:', texts.slice(0, 12).join(' | '))
  await p.close()
}
await b.close()
