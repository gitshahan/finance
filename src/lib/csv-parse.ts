export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      cells.push(current);
      const hasContent = cells.some((cell) => cell.trim().length > 0);
      if (hasContent) {
        rows.push(cells);
      }
      cells = [];
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  if (cells.some((cell) => cell.trim().length > 0)) {
    rows.push(cells);
  }

  return rows;
}

export function parseCsv(text: string): ParsedCsv {
  const rows = parseCsvRows(text);

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headers = [], ...dataRows] = rows;
  return { headers, rows: dataRows };
}
