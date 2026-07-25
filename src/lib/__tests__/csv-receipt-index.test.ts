import { describe, expect, it } from "vitest";
import {
  csvRowSourceKey,
  mapCsvRowToReceiptFields,
} from "@/lib/csv-receipt-index";

describe("csv receipt indexing helpers", () => {
  it("maps common CSV headers into receipt fields", () => {
    const fields = mapCsvRowToReceiptFields(
      ["Date", "Merchant", "Amount", "Currency"],
      ["2026-03-15", "Starbucks", "12.50", "USD"],
    );

    expect(fields.merchant).toBe("Starbucks");
    expect(fields.totalAmount).toBe(12.5);
    expect(fields.currency).toBe("USD");
    expect(fields.receiptDate).toMatch(/^2026-03-15/);
  });

  it("builds stable synthetic source keys per CSV row", () => {
    expect(csvRowSourceKey("https://blob.example/a.csv", 3)).toBe(
      "https://blob.example/a.csv#csv-row=3",
    );
  });
});
