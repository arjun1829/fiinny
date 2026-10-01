/**
 * Minimal, dependency-free RFC 4180 CSV parser.
 *
 * Handles quoted fields, escaped quotes (""), and newlines inside quotes, with
 * either \n or \r\n line endings. Returns an array of records (each a string[]).
 * Google Analytics CSV exports are UTF-8 and comma-delimited; comment/blank
 * lines are left intact here and filtered by the domain layer.
 */
export function parseCsv(text: string): string[][] {
  // Strip a leading UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let sawAny = false;

  const pushField = () => {
    record.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
    sawAny = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    switch (ch) {
      case '"':
        inQuotes = true;
        sawAny = true;
        break;
      case ',':
        pushField();
        sawAny = true;
        break;
      case '\r':
        // Swallow; the following \n (if any) triggers the record break.
        if (text[i + 1] !== '\n') pushRecord();
        break;
      case '\n':
        pushRecord();
        break;
      default:
        field += ch;
        sawAny = true;
    }
  }

  // Flush trailing field/record if the file did not end with a newline.
  if (sawAny || field.length > 0 || record.length > 0) pushRecord();

  return records;
}
