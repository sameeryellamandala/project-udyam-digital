const PAGE_LIMIT = 4;
const MAX_PIXELS = 4000000;

async function pdfEngine() {
  const canvas = await import('@napi-rs/canvas');
  globalThis.DOMMatrix ||= canvas.DOMMatrix;
  globalThis.ImageData ||= canvas.ImageData;
  globalThis.Path2D ||= canvas.Path2D;
  return { canvas, pdfjs: await import('pdfjs-dist/legacy/build/pdf.mjs') };
}

export async function prepareDocuments(documents) {
  const prepared = [];
  for (const doc of documents) {
    if (!doc.dataUrl.startsWith('data:application/pdf;base64,')) {
      prepared.push(doc);
      continue;
    }
    const encoded = doc.dataUrl.slice('data:application/pdf;base64,'.length);
    const bytes = Buffer.from(encoded, 'base64');
    const { canvas, pdfjs } = await pdfEngine();
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true, disableFontFace: true, verbosity: 0 });
    const pdf = await task.promise;
    try {
      if (pdf.numPages < 1 || pdf.numPages > PAGE_LIMIT) throw new Error(`PDF uploads may contain ${PAGE_LIMIT} pages per document or fewer.`);
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(1.5, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
        const viewport = page.getViewport({ scale });
        const width = Math.floor(viewport.width), height = Math.floor(viewport.height);
        if (width < 100 || height < 100 || width * height > MAX_PIXELS) throw new Error('PDF page size is not supported.');
        const image = canvas.createCanvas(width, height);
        await page.render({ canvasContext: image.getContext('2d'), viewport }).promise;
        const text=(await page.getTextContent()).items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('');
        prepared.push({ text,kind: doc.kind, dataUrl: `data:image/png;base64,${image.toBuffer('image/png').toString('base64')}`, pageNumber });
        page.cleanup();
      }
    } finally {
      await task.destroy();
    }
  }
  return prepared;
}
