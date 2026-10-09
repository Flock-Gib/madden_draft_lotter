const { test, expect } = require("@playwright/test");

async function loadPreview(page) {
  await page.goto("/");
  await page.locator("#loadDemoBtn").click();
  await page.locator("#manualProtectionToggle").check();
  await page.locator("#seedEnabledToggle").check();
  await page.locator("#seedInput").fill("layout-review");
  await page.locator("#seedInput").press("Tab");
  await page.locator("#setupLockBtn").click();
  await page.locator("#dryRunBtn").click();
  await expect(page.locator("#dryRunResults .result-card")).toHaveCount(8);
}

for (const width of [1920, 768, 375]) {
  test(`spacious layout stays contained at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Fixed viewport coverage runs once.");
    await page.setViewportSize({ width, height: 1080 });
    await loadPreview(page);

    const layout = await page.evaluate(() => {
      const selectors = [".setting-card", ".flow-steps a", ".result-card > *", ".mobile-team-card"];
      return {
        pageWidth: document.documentElement.scrollWidth,
        shellWidth: document.querySelector(".app-shell").getBoundingClientRect().width,
        panelPadding: parseFloat(getComputedStyle(document.querySelector(".panel")).paddingLeft),
        overflow: selectors.flatMap((selector) => [...document.querySelectorAll(selector)]
          .filter((el) => el.clientWidth && el.scrollWidth > el.clientWidth + 1)
          .map(() => selector)),
        targets: [...document.querySelectorAll(".button, input, select, textarea")]
          .filter((el) => el.getClientRects().length)
          .map((el) => el.getBoundingClientRect().height),
      };
    });
    expect(layout.pageWidth).toBe(width);
    expect(layout.shellWidth).toBeLessThanOrEqual(1400);
    expect(layout.panelPadding).toBeGreaterThanOrEqual(24);
    expect(layout.overflow).toEqual([]);
    expect(layout.targets.every((height) => height >= 44)).toBe(true);
    await expect(page.locator(".setup-table")).toBeVisible({ visible: width >= 768 });
    await expect(page.locator(".mobile-team-list")).toBeVisible({ visible: width < 768 });
    await expect(page.locator('.flow-steps [aria-current="step"]')).toHaveCount(1);
    await expect(page.locator(".flow-steps .is-done .step-num").first())
      .toHaveCSS("position", "relative");

    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`layout-${width}.png`), fullPage: true, animations: "disabled" });
    await testInfo.attach(`Layout ${width}px`, {
      path: testInfo.outputPath(`layout-${width}.png`), contentType: "image/png",
    });
    await page.locator("#setupLockBtn").click();
    await page.locator("#overrideNumberOneBtn").click();
    const dialog = page.locator("#flagOverrideDialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(15);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 15);
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(1080);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
}

test("keyboard focus, accessible controls, and reduced motion are preserved", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loadPreview(page);
  await page.locator("#setupLockBtn").click();
  await page.keyboard.press("Tab");
  await page.locator("#overrideNumberOneBtn").focus();
  await expect(page.locator("#overrideNumberOneBtn")).toHaveCSS("outline-style", "solid");
  await expect(page.locator("#overrideNumberOneBtn")).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Enter");
  await expect(page.locator("#flagOverrideDialog")).toBeVisible();
  await expect(page.locator("#cancelFlagOverrideBtn")).toBeFocused();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement === document.body)) {
      await page.keyboard.press("Tab");
    }
    expect(await page.evaluate(() => !!document.activeElement.closest("#flagOverrideDialog"))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("#overrideNumberOneBtn")).toBeFocused();
  await expect(page.locator("#dryRunResults .result-card").first()).toHaveCSS("animation-name", "none");
  await expect(page.locator("#dryRunBtn")).toHaveCSS("transition-duration", "0s");

  const session = await page.context().newCDPSession(page);
  const { nodes } = await session.send("Accessibility.getFullAXTree");
  const controls = new Set(["button", "textbox", "combobox", "spinbutton", "checkbox"]);
  const unnamed = nodes.filter((node) => !node.ignored && controls.has(node.role?.value) && !node.name?.value);
  expect(unnamed.map((node) => node.role.value)).toEqual([]);
  await session.detach();
});

test("text and form boundaries meet contrast targets", async ({ page }) => {
  await loadPreview(page);
  const failures = await page.evaluate(() => {
    const rgba = (value) => value.match(/[\d.]+/g).map(Number);
    const blend = (color, base) => color.slice(0, 3)
      .map((channel, i) => channel * (color[3] ?? 1) + base[i] * (1 - (color[3] ?? 1)));
    const luminance = (color) => color.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05)
      / (Math.min(luminance(a), luminance(b)) + 0.05);
    const background = (el) => {
      const ancestors = [];
      for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
      return ancestors.reduce((base, node) => {
        const style = getComputedStyle(node);
        const solid = blend(rgba(style.backgroundColor), base);
        const stops = style.backgroundImage.match(/rgba?\([^)]+\)/g) || [];
        // Use the brightest gradient stop as a conservative text contrast check.
        return stops.map((stop) => blend(rgba(stop), solid))
          .reduce((brightest, stop) => luminance(stop) > luminance(brightest) ? stop : brightest, solid);
      }, [12, 10, 18]);
    };
    const selectors = ".helper-text, .eyebrow, .tagline, .button:not(:disabled), .site-nav a, "
      + ".setting-card strong, .setting-card small, .flow-steps strong, .flow-steps small, "
      + ".step-num, .result-pick, .result-team, .result-owner, .movement-badge, .tie-break-badge";
    const errors = [...document.querySelectorAll(selectors)]
      .filter((el) => el.getClientRects().length)
      .filter((el) => contrast(rgba(getComputedStyle(el).color), background(el)) < 4.5)
      .map((el) => `${el.className}: ${el.textContent.trim()}`);
    for (const el of document.querySelectorAll('input:not([type="checkbox"]):not(:disabled), select:not(:disabled), textarea')) {
      if (!el.getClientRects().length) continue;
      if (contrast(rgba(getComputedStyle(el).borderTopColor), background(el.parentElement)) < 3) {
        errors.push(`Low contrast boundary: ${el.id}`);
      }
    }
    return errors;
  });
  expect(failures).toEqual([]);
});
