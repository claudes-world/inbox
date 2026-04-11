/**
 * E2E data loading tests — loading states, empty states, error handling,
 * and correct rendering of API data.
 */
import { test, expect } from "@playwright/test";
import {
  mockApi,
  emptyInboxResponse,
  inboxResponse,
  messageReadResponse,
  directoryResponse,
  threadResponse,
} from "./mocks/handlers.js";

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.describe("Data Loading", () => {
  test("inbox shows data after loading", async ({ page }) => {
    await page.goto("/app/");
    // Data loads and shows inbox items
    await expect(page.getByText("Need engineering status")).toBeVisible();
    await expect(page.getByText("Sprint planning notes")).toBeVisible();
    // Message count
    await expect(page.getByText("2 messages")).toBeVisible();
  });

  test("empty inbox shows empty state", async ({ page }) => {
    // Override the inbox route to return empty (LIFO: registered after mockApi, so checked first)
    await page.route(/\/api\/inbox(\?|$)/, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(emptyInboxResponse),
        });
      }
      return route.continue();
    });

    await page.goto("/app/");
    await expect(page.getByText("No messages")).toBeVisible();
  });

  test("message read shows full message content", async ({ page }) => {
    await page.goto("/app/#/message/msg_read_001");
    await expect(
      page.getByText("Please send your weekly report by 5pm."),
    ).toBeVisible();
    // Subject heading
    await expect(
      page.getByRole("heading", { name: "Need engineering status" }),
    ).toBeVisible();
    // Sender
    await expect(page.getByText("From: pm-alpha@vps-1")).toBeVisible();
    // Engagement state badge
    await expect(page.getByText("read", { exact: true })).toBeVisible();
    // Action buttons
    await expect(
      page.getByRole("button", { name: "Acknowledge" }),
    ).toBeVisible();
    // Reply button exists (there are two — header and action bar)
    await expect(
      page.getByRole("button", { name: "Reply" }).first(),
    ).toBeVisible();
  });

  test("compose form has required fields", async ({ page }) => {
    await page.goto("/app/#/compose");
    // To field
    await expect(page.getByPlaceholder("user@host, user2@host")).toBeVisible();
    // Subject field
    await expect(page.getByPlaceholder("Message subject")).toBeVisible();
    // Body field
    await expect(page.getByPlaceholder("Message body...")).toBeVisible();
    // Urgency selector
    await expect(page.getByText("Urgency")).toBeVisible();
    // Send button
    await expect(
      page.getByRole("button", { name: "Send Message" }),
    ).toBeVisible();
  });

  test("directory shows address list with details", async ({ page }) => {
    await page.goto("/app/#/directory");
    // Use main content area to avoid matching identity selector dropdown
    const main = page.locator("main");
    await expect(main.getByText("Project Manager Alpha")).toBeVisible();
    await expect(main.getByText("Engineering Manager")).toBeVisible();
    await expect(main.getByText("CEO", { exact: true }).first()).toBeVisible();
    await expect(main.getByText("Engineering Leads", { exact: true })).toBeVisible();
    // Address count
    await expect(page.getByText("4 addresses")).toBeVisible();
  });

  test("thread shows messages and quick reply", async ({ page }) => {
    await page.goto("/app/#/thread/cnv_001");
    // Thread messages
    await expect(
      page.getByText("Please send your weekly report..."),
    ).toBeVisible();
    await expect(
      page.getByText("Status report attached..."),
    ).toBeVisible();
    // Quick reply section
    await expect(page.getByText("Quick Reply")).toBeVisible();
    await expect(
      page.getByPlaceholder("Type your reply..."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send Reply" }),
    ).toBeVisible();
  });

  test("error state shown when API returns 500", async ({ page }) => {
    // Override inbox route to return a 500 error (LIFO: checked before mockApi's handler)
    await page.route(/\/api\/inbox(\?|$)/, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: {
              code: "internal",
              message: "Internal server error",
              target: null,
              details: null,
            },
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/app/");
    await expect(page.getByText("Failed to load inbox")).toBeVisible();
    await expect(page.getByText("Internal server error")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  test("sent screen shows sent message list", async ({ page }) => {
    await page.goto("/app/#/sent");
    await expect(page.getByText("Need engineering status")).toBeVisible();
    await expect(page.getByText("Sprint planning notes")).toBeVisible();
    await expect(page.getByText("2 sent")).toBeVisible();
  });
});
