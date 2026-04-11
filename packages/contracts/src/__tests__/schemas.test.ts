/**
 * Contract tests — every fixture must parse through its Zod schema.
 *
 * This is the primary contract enforcement mechanism: if a fixture drifts
 * from the schema, or the schema drifts from the spec, these tests fail.
 */
import { describe, expect, it } from "vitest";
import {
  whoamiResponseSchema,
  sendResponseSchema,
  listResponseSchema,
  readResponseSchema,
  replyResponseSchema,
  mutationResponseSchema,
  sentListResponseSchema,
  sentReadResponseSchema,
  sentMutationResponseSchema,
  threadResponseSchema,
  directoryListResponseSchema,
  directoryShowResponseSchema,
  directoryMembersResponseSchema,
  giveFeedbackResponseSchema,
  errorEnvelopeSchema,
  comingSoonErrorSchema,
  addressSummarySchema,
  messageId,
  conversationId,
  deliveryId,
  feedbackId,
  addressStr,
  timestampMs,
  experimentSchema,
  experimentListResponseSchema,
  feedbackEntrySchema,
  feedbackBoardResponseSchema,
  deliveryEventSchema,
  deliveryEventListResponseSchema,
} from "../schemas.js";
import {
  whoamiFixture,
  sendFixture,
  listFixture,
  readFixture,
  replyFixture,
  ackFixture,
  hideFixture,
  sentListFixture,
  sentReadFixture,
  sentHideFixture,
  threadFixture,
  directoryListFixture,
  directoryShowFixture,
  directoryMembersFixture,
  giveFeedbackFixture,
  notFoundError,
  invalidArgumentError,
  comingSoonError,
  pmAlpha,
  engManager,
  ceo,
  engLeadsList,
  experimentActive,
  experimentCompleted,
  experimentListFixture,
  feedbackPositive,
  feedbackNegative,
  feedbackBoardFixture,
  deliveryEventDelivered,
  deliveryEventRead,
  deliveryEventAcknowledged,
  deliveryEventListFixture,
} from "../fixtures.js";

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

describe("primitive schemas", () => {
  it("messageId accepts valid prefixed IDs", () => {
    expect(messageId.safeParse("msg_abc123").success).toBe(true);
    expect(messageId.safeParse("msg_").success).toBe(true);
    expect(messageId.safeParse("cnv_abc").success).toBe(false);
    expect(messageId.safeParse("").success).toBe(false);
  });

  it("conversationId accepts valid prefixed IDs", () => {
    expect(conversationId.safeParse("cnv_abc123").success).toBe(true);
    expect(conversationId.safeParse("msg_abc").success).toBe(false);
  });

  it("deliveryId accepts valid prefixed IDs", () => {
    expect(deliveryId.safeParse("dly_001").success).toBe(true);
    expect(deliveryId.safeParse("msg_001").success).toBe(false);
  });

  it("feedbackId accepts valid prefixed IDs", () => {
    expect(feedbackId.safeParse("fbk_001").success).toBe(true);
    expect(feedbackId.safeParse("msg_001").success).toBe(false);
  });

  it("addressStr validates local@host format", () => {
    expect(addressStr.safeParse("pm-alpha@vps-1").success).toBe(true);
    expect(addressStr.safeParse("eng-leads@lists").success).toBe(true);
    expect(addressStr.safeParse("nohost").success).toBe(false);
    expect(addressStr.safeParse("").success).toBe(false);
    expect(addressStr.safeParse("a@b@c").success).toBe(false);
  });

  it("timestampMs accepts non-negative integers", () => {
    expect(timestampMs.safeParse(1_775_754_070_000).success).toBe(true);
    expect(timestampMs.safeParse(0).success).toBe(true);
    expect(timestampMs.safeParse(-1).success).toBe(false);
    expect(timestampMs.safeParse(1.5).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Address summary fixtures
// ---------------------------------------------------------------------------

describe("address summary", () => {
  it.each([
    ["pmAlpha", pmAlpha],
    ["engManager", engManager],
    ["ceo", ceo],
    ["engLeadsList", engLeadsList],
  ])("fixture %s parses", (_name, fixture) => {
    expect(addressSummarySchema.parse(fixture)).toEqual(fixture);
  });
});

// ---------------------------------------------------------------------------
// Command response fixtures
// ---------------------------------------------------------------------------

describe("command response schemas", () => {
  it("whoami fixture parses", () => {
    expect(whoamiResponseSchema.parse(whoamiFixture)).toEqual(whoamiFixture);
  });

  it("send fixture parses", () => {
    expect(sendResponseSchema.parse(sendFixture)).toEqual(sendFixture);
  });

  it("list fixture parses", () => {
    expect(listResponseSchema.parse(listFixture)).toEqual(listFixture);
  });

  it("read fixture parses", () => {
    expect(readResponseSchema.parse(readFixture)).toEqual(readFixture);
  });

  it("reply fixture parses", () => {
    expect(replyResponseSchema.parse(replyFixture)).toEqual(replyFixture);
  });

  it("ack mutation fixture parses", () => {
    expect(mutationResponseSchema.parse(ackFixture)).toEqual(ackFixture);
  });

  it("hide mutation fixture parses", () => {
    expect(mutationResponseSchema.parse(hideFixture)).toEqual(hideFixture);
  });

  it("sent list fixture parses", () => {
    expect(sentListResponseSchema.parse(sentListFixture)).toEqual(
      sentListFixture,
    );
  });

  it("sent read fixture parses", () => {
    expect(sentReadResponseSchema.parse(sentReadFixture)).toEqual(
      sentReadFixture,
    );
  });

  it("sent hide fixture parses", () => {
    expect(sentMutationResponseSchema.parse(sentHideFixture)).toEqual(
      sentHideFixture,
    );
  });

  it("thread fixture parses", () => {
    expect(threadResponseSchema.parse(threadFixture)).toEqual(threadFixture);
  });

  it("directory list fixture parses", () => {
    expect(directoryListResponseSchema.parse(directoryListFixture)).toEqual(
      directoryListFixture,
    );
  });

  it("directory show fixture parses", () => {
    expect(directoryShowResponseSchema.parse(directoryShowFixture)).toEqual(
      directoryShowFixture,
    );
  });

  it("directory members fixture parses", () => {
    expect(
      directoryMembersResponseSchema.parse(directoryMembersFixture),
    ).toEqual(directoryMembersFixture);
  });

  it("give-feedback fixture parses", () => {
    expect(giveFeedbackResponseSchema.parse(giveFeedbackFixture)).toEqual(
      giveFeedbackFixture,
    );
  });
});

// ---------------------------------------------------------------------------
// Error fixtures
// ---------------------------------------------------------------------------

describe("error schemas", () => {
  it("not_found error parses", () => {
    expect(errorEnvelopeSchema.parse(notFoundError)).toEqual(notFoundError);
  });

  it("invalid_argument error parses", () => {
    expect(errorEnvelopeSchema.parse(invalidArgumentError)).toEqual(
      invalidArgumentError,
    );
  });

  it("coming_soon error parses", () => {
    expect(comingSoonErrorSchema.parse(comingSoonError)).toEqual(
      comingSoonError,
    );
  });
});

// ---------------------------------------------------------------------------
// Rejection tests — schemas must reject malformed data
// ---------------------------------------------------------------------------

describe("schema rejections", () => {
  it("whoami rejects missing address", () => {
    const bad = { ...whoamiFixture, address: undefined };
    expect(whoamiResponseSchema.safeParse(bad).success).toBe(false);
  });

  it("send rejects zero resolved_recipient_count", () => {
    const bad = { ...sendFixture, resolved_recipient_count: 0 };
    expect(sendResponseSchema.safeParse(bad).success).toBe(false);
  });

  it("list item rejects wrong message_id prefix", () => {
    const bad = {
      ...listFixture,
      items: [{ ...listFixture.items[0], message_id: "cnv_wrong" }],
    };
    expect(listResponseSchema.safeParse(bad).success).toBe(false);
  });

  it("error envelope rejects ok:true", () => {
    const bad = { ok: true, error: { code: "not_found", message: "nope" } };
    expect(errorEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it("address rejects missing @", () => {
    const bad = { ...pmAlpha, address: "nohost" };
    expect(addressSummarySchema.safeParse(bad).success).toBe(false);
  });

  it("mutation rejects unknown view_kind", () => {
    const bad = { ...ackFixture, view_kind: "draft" };
    expect(mutationResponseSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

describe("experiment schemas", () => {
  it.each([
    ["active", experimentActive],
    ["completed", experimentCompleted],
  ])("fixture %s parses", (_name, fixture) => {
    expect(experimentSchema.parse(fixture)).toEqual(fixture);
  });

  it("experiment list fixture parses", () => {
    expect(experimentListResponseSchema.parse(experimentListFixture)).toEqual(
      experimentListFixture,
    );
  });

  it("rejects experiment id without exp_ prefix", () => {
    const bad = { ...experimentActive, id: "xyz_foo" };
    expect(experimentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects experiment with fewer than two variants", () => {
    const bad = { ...experimentActive, variants: [{ name: "only", weight: 100 }] };
    expect(experimentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects experiment variant with weight > 100", () => {
    const bad = {
      ...experimentActive,
      variants: [
        { name: "a", weight: 150 },
        { name: "b", weight: 50 },
      ],
    };
    expect(experimentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects experiment with unknown status", () => {
    const bad = { ...experimentActive, status: "draft" };
    expect(experimentSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts experiment with null end_ts and omitted metrics", () => {
    const minimal = {
      id: "exp_min_001",
      name: "Minimal",
      description: "",
      status: "paused" as const,
      variants: [
        { name: "a", weight: 50 },
        { name: "b", weight: 50 },
      ],
      start_ts: 1_000_000,
      end_ts: null,
    };
    expect(experimentSchema.safeParse(minimal).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feedback board
// ---------------------------------------------------------------------------

describe("feedback board schemas", () => {
  it.each([
    ["positive", feedbackPositive],
    ["negative", feedbackNegative],
  ])("fixture %s parses", (_name, fixture) => {
    expect(feedbackEntrySchema.parse(fixture)).toEqual(fixture);
  });

  it("feedback board fixture parses", () => {
    expect(feedbackBoardResponseSchema.parse(feedbackBoardFixture)).toEqual(
      feedbackBoardFixture,
    );
  });

  it("rejects feedback with rating out of range", () => {
    const bad = { ...feedbackPositive, rating: 6 };
    expect(feedbackEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects feedback with unknown sentiment", () => {
    const bad = { ...feedbackPositive, sentiment: "angry" };
    expect(feedbackEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects feedback id without fbk_ prefix", () => {
    const bad = { ...feedbackPositive, id: "msg_001" };
    expect(feedbackEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects feedback board with null average_rating of wrong type", () => {
    const bad = { ...feedbackBoardFixture, summary: { ...feedbackBoardFixture.summary, average_rating: 7 } };
    expect(feedbackBoardResponseSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Delivery events (inspector)
// ---------------------------------------------------------------------------

describe("delivery event schemas", () => {
  it.each([
    ["delivered", deliveryEventDelivered],
    ["read", deliveryEventRead],
    ["acknowledged", deliveryEventAcknowledged],
  ])("fixture %s parses", (_name, fixture) => {
    expect(deliveryEventSchema.parse(fixture)).toEqual(fixture);
  });

  it("delivery event list fixture parses", () => {
    expect(
      deliveryEventListResponseSchema.parse(deliveryEventListFixture),
    ).toEqual(deliveryEventListFixture);
  });

  it("rejects delivery event id without evt_ prefix", () => {
    const bad = { ...deliveryEventDelivered, id: "msg_001" };
    expect(deliveryEventSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects delivery event with unknown event_type", () => {
    const bad = { ...deliveryEventDelivered, event_type: "teleported" };
    expect(deliveryEventSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts delivery event with null from_state (initial event)", () => {
    expect(
      deliveryEventSchema.safeParse({
        ...deliveryEventDelivered,
        from_state: null,
      }).success,
    ).toBe(true);
  });

  it("rejects delivery event missing to_state", () => {
    const bad = { ...deliveryEventDelivered } as Record<string, unknown>;
    delete bad.to_state;
    expect(deliveryEventSchema.safeParse(bad).success).toBe(false);
  });
});
