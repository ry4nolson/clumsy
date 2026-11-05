export const DAMAGED_PDF = "The file is damaged or incomplete, so it can't be read as a PDF.";

export function openErrorDetail(error: unknown) {
  if (error instanceof Error && error.name === "InvalidPDFException") {
    return DAMAGED_PDF;
  }
  return error instanceof Error ? error.message : String(error);
}
