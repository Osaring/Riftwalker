// Run against a local HTTP server: ECLIPSE_TEST_URL=http://127.0.0.1:8765/eclipse-rpg/ node eclipse-rpg/tests/regression.cjs
const { chromium } = require(
  process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
    ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + "/playwright"
    : "playwright",
);
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Advance simulation explicitly to make combat regressions reproducible.
    await page.addInitScript(() => {
      window.requestAnimationFrame = () => 0;
      window.confirm = () => true;
    });
    await page.goto(
      process.env.ECLIPSE_TEST_URL || "http://127.0.0.1:8765/eclipse-rpg/",
    );
    const results = await page.evaluate(require("./scenarios.cjs"));
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(results.map((x) => "PASS " + x).join("\n"));
    // Exercise a real multi-touch gesture, using the browser's touch event dispatch.
    await page.reload();
    await page.getByRole("button", { name: "🛡 Guerrier", exact: true }).click();
    const rect = await page.locator("#stick").boundingBox();
    const attackRect = await page.locator("#attack").boundingBox();
    const session = await page.context().newCDPSession(page);
    const first = {
      x: rect.x + rect.width * 0.8,
      y: rect.y + rect.height * 0.5,
      id: 1,
    };
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [first],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        first,
        {
          x: attackRect.x + attackRect.width / 2,
          y: attackRect.y + attackRect.height / 2,
          id: 2,
        },
      ],
    });
    assert.ok(
      await page.evaluate(() => jo.x > 0 && held && atk > 0),
      "move and attack together",
    );
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.ok(
      await page.evaluate(() => jo.x === 0 && !held),
      "touch release clears movement and attack",
    );
    console.log("PASS simultaneous mobile movement and attack");
    await page.evaluate(() => {
      draw();
    });
    await page.screenshot({ path: "/tmp/eclipse-portrait.png" });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => {
      resize();
      draw();
    });
    await page.screenshot({ path: "/tmp/eclipse-landscape.png" });
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("PASS portrait and landscape render without runtime errors");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
