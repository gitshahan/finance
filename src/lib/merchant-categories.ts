/** Normalize merchant names for category lookup keys. */
export function normalizeMerchantKey(merchant: string | null | undefined): string | null {
  if (!merchant?.trim()) {
    return null;
  }

  return merchant.trim().toLowerCase().replace(/\s+/g, " ");
}

const HEURISTIC_CATEGORY_RULES: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: "Groceries",
    patterns: [
      /\b(walmart|costco|kroger|safeway|trader\s*joe|whole\s*foods|aldi|lidl|tesco|sainsbury|grocery|supermarket)\b/i,
    ],
  },
  {
    category: "Dining",
    patterns: [
      /\b(starbucks|mcdonald|burger\s*king|wendy|chipotle|subway|dunkin|restaurant|cafe|coffee|pizza|doordash|uber\s*eats|grubhub)\b/i,
    ],
  },
  {
    category: "Transport",
    patterns: [
      /\b(uber|lyft|shell|exxon|chevron|bp\b|gas\s*station|parking|transit|metro|airline|delta|united|southwest)\b/i,
    ],
  },
  {
    category: "Entertainment",
    patterns: [
      /\b(netflix|spotify|disney|hulu|hbo|youtube|steam|playstation|xbox|cinema|movie|theater)\b/i,
    ],
  },
  {
    category: "Shopping",
    patterns: [
      /\b(amazon|target|best\s*buy|apple|ikea|nike|adidas|ebay|etsy)\b/i,
    ],
  },
  {
    category: "Utilities",
    patterns: [
      /\b(electric|utility|water\s*bill|internet|comcast|verizon|at&t|t-mobile|phone\s*bill)\b/i,
    ],
  },
  {
    category: "Health",
    patterns: [
      /\b(pharmacy|cvs|walgreens|hospital|clinic|dental|doctor|medical)\b/i,
    ],
  },
];

export function inferMerchantCategory(
  merchant: string | null | undefined,
): string | null {
  const key = normalizeMerchantKey(merchant);
  if (!key) {
    return null;
  }

  for (const rule of HEURISTIC_CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(key))) {
      return rule.category;
    }
  }

  return null;
}

export function resolveMerchantCategory(
  merchant: string | null | undefined,
  userOverride: string | null | undefined,
): string | null {
  const override = userOverride?.trim();
  if (override) {
    return override;
  }

  return inferMerchantCategory(merchant);
}
