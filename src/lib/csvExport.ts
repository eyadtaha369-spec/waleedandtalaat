/**
 * Excel and WPS Office misread a plain UTF-8 CSV as the wrong encoding
 * unless it starts with a byte-order mark, turning Arabic text into
 * mojibake. Prepend this to the CSV string before creating the Blob.
 */
export function withUtf8Bom(csv: string): string {
  return `\ufeff${csv}`;
}

/**
 * Excel/WPS auto-convert any long digit string (phone numbers) into a
 * number and display it in scientific notation, dropping leading
 * zeros. Wrapping the value in ="..." forces it to stay literal text.
 */
export function excelTextCell(value: string): string {
  return `="${value.replace(/"/g, '""')}"`;
}
