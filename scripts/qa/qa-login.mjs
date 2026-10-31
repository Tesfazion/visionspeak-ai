export default async function run(page, ui) {
  // Sign in with the QA account
  await ui.fill("@e8", "qa@test.local");
  await ui.fill("@e9", "TestPass123!");
  await ui.click("@e10");
  await page.waitForURL("**/dashboard", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const url = page.url();
  return { urlAfterLogin: url };
}
