/**
 * Post-export CSV structural validation.
 * Checks the generated WooCommerce CSV for structural errors before the
 * user imports it.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AuditError {
  row: number;
  column?: string;
  message: string;
}

export interface AuditResult {
  errors: AuditError[];
}

// ---------------------------------------------------------------------------
// CSV parsing (minimal, handles quoted fields, strict line-based)
// ---------------------------------------------------------------------------

/**
 * Parse CSV into rows. Each line is treated as a single row boundary;
 * newlines inside quoted fields terminate the row (not cross-line mode).
 * Returns rows and, for each data row index (0-based from start of file),
 * whether it had an unclosed quoted field.
 */
function parseCsvRows(csv: string): { rows: string[][]; malformed: Set<number> } {
  const raw = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;

  const rows: string[][] = [];
  const malformed = new Set<number>();
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (ch === "\n") {
        // Newline terminates the row even inside quotes (strict line-based mode).
        // Record this row as malformed due to an unclosed quoted field.
        row.push(field);
        field = "";
        inQuotes = false;
        if (row.length > 1 || row[0] !== "") {
          malformed.add(rows.length); // index of the row we're about to push
          rows.push(row);
        }
        row = [];
      } else if (ch === "\r") {
        // skip \r
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (ch === "\r") {
      // skip \r
    } else {
      field += ch;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") {
      if (inQuotes) malformed.add(rows.length);
      rows.push(row);
    }
  }

  return { rows, malformed };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function auditCsv(csv: string): AuditResult {
  const errors: AuditError[] = [];
  const { rows, malformed } = parseCsvRows(csv);

  if (rows.length === 0) return { errors };

  const headers = rows[0];
  const headerCount = headers.length;

  const typeIdx = headers.indexOf("Type");
  const skuIdx = headers.indexOf("SKU");
  const parentIdx = headers.indexOf("Parent");

  const skuSeen = new Map<string, number>();
  const parentSkus = new Set<string>();
  const variationParents = new Map<number, string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    // A malformed row (unclosed quoted field) indicates a structural issue —
    // report as a column count mismatch since the true field count is unknown.
    if (malformed.has(i)) {
      errors.push({
        row: rowNum,
        message: `Inconsistent column count: row has a malformed (unclosed quoted) field`,
      });
    } else if (row.length !== headerCount) {
      errors.push({
        row: rowNum,
        message: `Inconsistent column count: expected ${headerCount}, got ${row.length}`,
      });
    }

    const type = typeIdx >= 0 && typeIdx < row.length ? row[typeIdx] : "";
    const sku = skuIdx >= 0 && skuIdx < row.length ? row[skuIdx] : "";
    const parent = parentIdx >= 0 && parentIdx < row.length ? row[parentIdx] : "";

    if (!sku) {
      errors.push({ row: rowNum, column: "SKU", message: "Row has empty SKU" });
    }

    if (sku && skuSeen.has(sku)) {
      errors.push({
        row: rowNum,
        column: "SKU",
        message: `Duplicate SKU "${sku}" (first seen row ${skuSeen.get(sku)})`,
      });
    } else if (sku) {
      skuSeen.set(sku, rowNum);
    }

    if (type === "variable") {
      parentSkus.add(sku);
    }
    if (type === "variation" && parent) {
      variationParents.set(rowNum, parent);
    }
  }

  for (const [rowNum, parent] of variationParents) {
    if (!parentSkus.has(parent)) {
      errors.push({
        row: rowNum,
        column: "Parent",
        message: `orphan variation: parent SKU "${parent}" not found as a variable product`,
      });
    }
  }

  const variationsPerParent = new Map<string, number>();
  for (const [, parent] of variationParents) {
    variationsPerParent.set(parent, (variationsPerParent.get(parent) ?? 0) + 1);
  }
  for (const sku of parentSkus) {
    if (!variationsPerParent.has(sku)) {
      const rowNum = skuSeen.get(sku) ?? 0;
      errors.push({
        row: rowNum,
        column: "Type",
        message: `Variable product "${sku}" has no variation rows`,
      });
    }
  }

  return { errors };
}
