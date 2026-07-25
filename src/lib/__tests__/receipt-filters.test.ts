import { describe, expect, it } from "vitest";
import {
  hasActiveExportFilter,
  parseReceiptFilters,
  validateReceiptExport,
} from "@/lib/receipt-filters";

describe("receipt filters", () => {
  it("parses category and date filters from search params", () => {
    const filters = parseReceiptFilters(
      new URLSearchParams(
        "search=coffee&merchant=Starbucks&category=Dining&from=2026-01-01&to=2026-01-31&receiptsOnly=true",
      ),
    );

    expect(filters).toEqual({
      search: "coffee",
      merchant: "Starbucks",
      category: "Dining",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      receiptsOnly: true,
      limit: undefined,
    });
  });

  it("treats category as an active export filter", () => {
    expect(hasActiveExportFilter({ category: "Groceries" })).toBe(true);
    expect(hasActiveExportFilter({ receiptsOnly: true })).toBe(false);
  });

  it("rejects export without narrowing filters", () => {
    const validation = validateReceiptExport({}, 10);
    expect(validation.allowed).toBe(false);
    expect(validation.message).toMatch(/filter/i);
  });

  it("allows export when filters and count are valid", () => {
    const validation = validateReceiptExport({ merchant: "Netflix" }, 3);
    expect(validation).toEqual({ allowed: true, message: null });
  });
});
