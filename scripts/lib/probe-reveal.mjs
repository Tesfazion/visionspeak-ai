export default async function run(page, ui) {
  // Scroll to a mid-page section and let its Reveal fire.
  await page.evaluate(() => document.querySelector("#signals")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(1100);
  return { done: true };
}
