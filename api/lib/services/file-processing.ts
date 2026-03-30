/**
 * Extract text from uploaded documents (PDF, DOCX, TXT).
 */
import { extname } from "node:path";
import { readFile } from "node:fs/promises";

/**
 * Extract text from a PDF file using pdf-parse.
 */
export async function extractTextFromPdf(filePath: string): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Extract text from a DOCX file using mammoth.
 */
export async function extractTextFromDocx(filePath: string): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await readFile(filePath);

  // mammoth.extractRawText gives us the text content without HTML markup
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Extract text from a plain text file (txt, md, csv).
 */
export async function extractTextFromTxt(filePath: string): Promise<string> {
  const buffer = await readFile(filePath, "utf-8");
  return buffer;
}

/**
 * Dispatch to the correct extractor based on file extension.
 *
 * Supported formats: .pdf, .docx, .doc, .txt, .md, .csv
 */
export async function extractText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".pdf":
      return extractTextFromPdf(filePath);
    case ".docx":
    case ".doc":
      return extractTextFromDocx(filePath);
    case ".txt":
    case ".md":
    case ".csv":
      return extractTextFromTxt(filePath);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
