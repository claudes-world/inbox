/**
 * Enum contract tests — verify frozen values match the spec.
 */
import { describe, expect, it } from "vitest";
import {
  AddressKind,
  EngagementState,
  VisibilityState,
  ViewKind,
  EffectiveRole,
  ErrorCode,
  ExitCode,
  RefKind,
  Urgency,
  ChangeKind,
  SourceKind,
  errorToExit,
} from "../enums.js";

describe("AddressKind", () => {
  it("has exactly 4 values matching schema CHECK", () => {
    const values = Object.values(AddressKind);
    expect(values).toEqual(["agent", "human", "service", "list"]);
  });
});

describe("EngagementState", () => {
  it("has exactly 3 values matching schema CHECK", () => {
    const values = Object.values(EngagementState);
    expect(values).toEqual(["unread", "read", "acknowledged"]);
  });
});

describe("VisibilityState", () => {
  it("has exactly 2 values matching schema CHECK", () => {
    const values = Object.values(VisibilityState);
    expect(values).toEqual(["active", "hidden"]);
  });
});

describe("ViewKind", () => {
  it("has received and sent", () => {
    expect(Object.values(ViewKind)).toEqual(["received", "sent"]);
  });
});

describe("EffectiveRole", () => {
  it("includes to, cc, bcc", () => {
    expect(Object.values(EffectiveRole)).toEqual(["to", "cc", "bcc"]);
  });
});

describe("ErrorCode", () => {
  it("has 6 frozen error codes from Contract A", () => {
    const values = Object.values(ErrorCode);
    expect(values).toEqual([
      "not_found",
      "invalid_argument",
      "invalid_state",
      "permission_denied",
      "internal_error",
      "coming_soon",
    ]);
  });
});

describe("ExitCode", () => {
  it("has 7 frozen exit codes from Contract H", () => {
    expect(ExitCode.Success).toBe(0);
    expect(ExitCode.InvalidArgument).toBe(1);
    expect(ExitCode.NotFound).toBe(2);
    expect(ExitCode.InvalidState).toBe(3);
    expect(ExitCode.PermissionDenied).toBe(4);
    expect(ExitCode.InternalError).toBe(5);
    expect(ExitCode.ComingSoon).toBe(6);
  });
});

describe("errorToExit mapping", () => {
  it("maps each error code to the correct exit code", () => {
    expect(errorToExit["not_found"]).toBe(2);
    expect(errorToExit["invalid_argument"]).toBe(1);
    expect(errorToExit["invalid_state"]).toBe(3);
    expect(errorToExit["permission_denied"]).toBe(4);
    expect(errorToExit["internal_error"]).toBe(5);
    expect(errorToExit["coming_soon"]).toBe(6);
  });

  it("covers all error codes", () => {
    const errorCodes = Object.values(ErrorCode);
    const mappedCodes = Object.keys(errorToExit);
    expect(mappedCodes.sort()).toEqual(errorCodes.sort());
  });
});

describe("RefKind", () => {
  it("has 6 values matching schema CHECK", () => {
    expect(Object.values(RefKind)).toEqual([
      "path",
      "url",
      "json",
      "text",
      "artifact_id",
      "other",
    ]);
  });
});

describe("Urgency", () => {
  it("has 4 values matching schema CHECK", () => {
    expect(Object.values(Urgency)).toEqual([
      "low",
      "normal",
      "high",
      "urgent",
    ]);
  });
});

describe("ChangeKind", () => {
  it("matches delivery_events CHECK constraint", () => {
    expect(Object.values(ChangeKind)).toEqual([
      "delivered",
      "read",
      "ack",
      "hide",
      "unhide",
    ]);
  });
});

describe("SourceKind", () => {
  it("matches delivery_sources CHECK constraint", () => {
    expect(Object.values(SourceKind)).toEqual(["direct", "list"]);
  });
});
