/**
 * E2E navigation tests — nav bar links, identity selector, back button.
 */
import { test, expect } from "@playwright/test";
import { mockApi } from "./mocks/handlers.js";

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.describe("Navigation", () => {
  test("nav bar has Inbox, Sent, Compose, Directory links", async ({
    page,
  }) => {
    await page.goto("/app/");
    await expect(page.getByText("Need engineering status")).toBeVisible();

    const nav = page.locator("nav");
    await expect(nav.getByRole("button", { name: "Inbox" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Sent" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Compose" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Directory" })).toBeVisible();
  });

  test("clicking Sent nav link navigates to sent screen", async ({
    page,
  }) => {
    await page.goto("/app/");
    await expect(page.getByText("Need engineering status")).toBeVisible();

    await page.locator("nav").getByRole("button", { name: "Sent" }).click();
    // Sent screen has Visibility filter (not State filter like inbox)
    await expect(page.getByText("2 sent")).toBeVisible();
  });

  test("clicking Compose nav link navigates to compose screen", async ({
    page,
  }) => {
    await page.goto("/app/");
    await expect(page.getByText("Need engineering status")).toBeVisible();

    await page
      .locator("nav")
      .getByRole("button", { name: "Compose" })
      .click();
    await expect(page.getByPlaceholder("user@host, user2@host")).toBeVisible();
  });

  test("clicking Directory nav link navigates to directory screen", async ({
    page,
  }) => {
    await page.goto("/app/");
    await expect(page.getByText("Need engineering status")).toBeVisible();

    await page
      .locator("nav")
      .getByRole("button", { name: "Directory" })
      .click();
    // Directory shows Kind filter and address count
    await expect(page.getByText("Kind:")).toBeVisible();
    await expect(page.getByText("4 addresses")).toBeVisible();
  });

  test("clicking Inbox nav link returns to inbox", async ({ page }) => {
    await page.goto("/app/#/sent");
    await expect(page.getByText("Need engineering status")).toBeVisible();

    await page.locator("nav").getByRole("button", { name: "Inbox" }).click();
    // Should show inbox-specific filter bar
    await expect(page.getByText("State:")).toBeVisible();
  });

  test("identity selector shows available addresses", async ({ page }) => {
    await page.goto("/app/");
    // Wait for identity to load (acting as label appears)
    await expect(page.getByText("Acting as:")).toBeVisible();

    // The identity selector dropdown is in the header
    const header = page.locator("header");
    const select = header.locator("select");
    await expect(select).toBeVisible();

    // Check option count: pmAlpha, engManager, ceo, engLeadsList = 4
    const options = select.locator("option");
    await expect(options).toHaveCount(4);
  });

  test("header title click navigates to inbox", async ({ page }) => {
    await page.goto("/app/#/directory");
    // Wait for directory to load
    await expect(page.getByText("4 addresses")).toBeVisible();

    // Click the "Inbox" title in the header
    await page.locator("h1").getByText("Inbox").click();
    // Should navigate to inbox with State filter
    await expect(page.getByText("State:")).toBeVisible();
    await expect(page.getByText("Need engineering status")).toBeVisible();
  });

  test("back navigation works via browser back button", async ({ page }) => {
    await page.goto("/app/");
    await expect(page.getByText("State:")).toBeVisible();

    // Navigate to compose
    await page
      .locator("nav")
      .getByRole("button", { name: "Compose" })
      .click();
    await expect(page.getByPlaceholder("user@host, user2@host")).toBeVisible();

    // Go back
    await page.goBack();
    // Should return to inbox (has State: filter)
    await expect(page.getByText("State:")).toBeVisible();
  });

  test("active nav link is highlighted", async ({ page }) => {
    await page.goto("/app/");
    await expect(page.getByText("State:")).toBeVisible();

    // Inbox nav button should have the active styling (bg-zinc-700)
    const inboxBtn = page
      .locator("nav")
      .getByRole("button", { name: "Inbox" });
    await expect(inboxBtn).toHaveClass(/bg-zinc-700/);

    // Navigate to Sent
    await page.locator("nav").getByRole("button", { name: "Sent" }).click();
    await expect(page.getByText("2 sent")).toBeVisible();

    // Sent should now be active
    const sentBtn = page
      .locator("nav")
      .getByRole("button", { name: "Sent" });
    await expect(sentBtn).toHaveClass(/bg-zinc-700/);
  });

  test("inbox message click navigates to message read screen", async ({
    page,
  }) => {
    await page.goto("/app/");
    // Wait for inbox data to load
    await expect(page.getByText("2 messages")).toBeVisible();

    // Click the first message row (the subject text is a button)
    await page.locator("main").getByText("Need engineering status").first().click();

    // Should show the full message body
    await expect(
      page.getByText("Please send your weekly report by 5pm."),
    ).toBeVisible();
  });
});
