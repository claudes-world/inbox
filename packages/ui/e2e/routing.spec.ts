/**
 * E2E routing tests — verify hash-based navigation resolves to correct screens.
 */
import { test, expect } from "@playwright/test";
import { mockApi } from "./mocks/handlers.js";

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.describe("Routing", () => {
  test("default route loads inbox screen", async ({ page }) => {
    await page.goto("/app/");
    // Inbox screen renders with filter bar and data
    await expect(page.getByText("Need engineering status")).toBeVisible();
    // Verify inbox-specific UI elements
    await expect(page.getByText("State:")).toBeVisible();
  });

  test("empty hash loads inbox screen", async ({ page }) => {
    await page.goto("/app/#");
    await expect(page.getByText("Need engineering status")).toBeVisible();
  });

  test("#/compose loads compose screen", async ({ page }) => {
    await page.goto("/app/#/compose");
    // Compose heading in the form area
    await expect(
      page.getByRole("heading", { name: "Compose" }),
    ).toBeVisible();
    // Compose form has the To field
    await expect(page.getByPlaceholder("user@host, user2@host")).toBeVisible();
  });

  test("#/sent loads sent screen", async ({ page }) => {
    await page.goto("/app/#/sent");
    // Sent screen shows the sent count after loading
    await expect(page.getByText("2 sent")).toBeVisible();
  });

  test("#/directory loads directory screen", async ({ page }) => {
    await page.goto("/app/#/directory");
    // Directory screen shows the kind filter and address count
    await expect(page.getByText("Kind:")).toBeVisible();
    await expect(page.getByText("4 addresses")).toBeVisible();
  });

  test("#/message/:id loads message read screen", async ({ page }) => {
    await page.goto("/app/#/message/msg_read_001");
    // Message read screen shows message body
    await expect(
      page.getByText("Please send your weekly report by 5pm."),
    ).toBeVisible();
    // Shows the subject heading
    await expect(
      page.getByRole("heading", { name: "Need engineering status" }),
    ).toBeVisible();
  });

  test("#/thread/:id loads thread screen", async ({ page }) => {
    await page.goto("/app/#/thread/cnv_001");
    // Thread screen shows conversation ID and Quick Reply section
    await expect(page.getByText("Quick Reply")).toBeVisible();
    await expect(page.getByText("cnv_001")).toBeVisible();
  });

  test("#/sent/:id loads sent read screen", async ({ page }) => {
    await page.goto("/app/#/sent/msg_sentread_001");
    // Sent read shows the message body
    await expect(
      page.getByText("Please send your weekly report by 5pm."),
    ).toBeVisible();
    // Shows "Back to Sent" nav in header area
    await expect(
      page.getByRole("button", { name: /Sent/ }).first(),
    ).toBeVisible();
  });

  test("deep link to compose with reply param", async ({ page }) => {
    await page.goto("/app/#/compose?reply=msg_read_001");
    // Reply mode shows "Reply" heading
    await expect(
      page.getByRole("heading", { name: "Reply" }),
    ).toBeVisible();
  });

  test("unknown route falls back to inbox", async ({ page }) => {
    await page.goto("/app/#/nonexistent-route");
    // Should render inbox as the default fallback
    await expect(page.getByText("Need engineering status")).toBeVisible();
  });

  test("hash-only navigation (no full page reload)", async ({ page }) => {
    await page.goto("/app/");
    await expect(page.getByText("Need engineering status")).toBeVisible();

    // Navigate to compose via hash change
    await page.evaluate(() => {
      window.location.hash = "/compose";
    });
    await expect(page.getByPlaceholder("user@host, user2@host")).toBeVisible();

    // Navigate back to inbox
    await page.evaluate(() => {
      window.location.hash = "/";
    });
    await expect(page.getByText("Need engineering status")).toBeVisible();
  });
});
