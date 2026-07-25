import { describe, expect, it } from "vitest";
import {
  inferMerchantCategory,
  normalizeMerchantKey,
  resolveMerchantCategory,
} from "@/lib/merchant-categories";

describe("merchant categories", () => {
  it("normalizes merchant keys", () => {
    expect(normalizeMerchantKey("  Starbucks  Coffee ")).toBe("starbucks coffee");
  });

  it("infers common merchant categories", () => {
    expect(inferMerchantCategory("Netflix")).toBe("Entertainment");
    expect(inferMerchantCategory("Whole Foods Market")).toBe("Groceries");
    expect(inferMerchantCategory("Uber Trip")).toBe("Transport");
  });

  it("prefers user overrides over heuristics", () => {
    expect(resolveMerchantCategory("Netflix", "Subscriptions")).toBe(
      "Subscriptions",
    );
    expect(resolveMerchantCategory("Netflix", null)).toBe("Entertainment");
  });
});
