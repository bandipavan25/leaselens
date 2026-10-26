import { PDFParse } from "pdf-parse";

function pageLabel(page) {
  return page.num ?? page.pageNumber ?? page.page ?? null;
}

export async function extractLeaseText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const rawPages = Array.isArray(result.pages) ? result.pages : [];
    const pages = rawPages
      .map((page, index) => {
        const text = (page.text || "").trim();
        return {
          page: pageLabel(page) || index + 1,
          text,
        };
      })
      .filter((page) => page.text.length > 0);

    let formatted;
    if (pages.length > 0) {
      formatted = pages
        .map((page) => `--- Page ${page.page} ---\n${page.text}`)
        .join("\n\n");
    } else {
      formatted = (result.text || "").trim();
    }

    if (!formatted) {
      const error = new Error(
        "No readable text was found. This PDF may be scanned images only.",
      );
      error.code = "EMPTY_PDF";
      throw error;
    }

    return {
      text: formatted,
      pageCount: pages.length || result.total || result.numpages || 1,
      pages,
    };
  } finally {
    await parser.destroy();
  }
}
