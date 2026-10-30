import { createWorker, PSM } from 'tesseract.js';
import english from '@tesseract.js-data/eng';
import { AppError } from './catalogue.mjs';

// Files and language model are installed locally. No image is uploaded for local OCR.
export function imageSize(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
      offset += length;
    }
  }
  throw new AppError('The image is incomplete or its dimensions cannot be read.');
}

function lines(words) {
  const groups = [];
  for (const word of [...words].sort((a,b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)) {
    const y = (word.bbox.y0 + word.bbox.y1) / 2;
    let line = groups.find(row => Math.abs(row.y - y) < Math.max(9, (word.bbox.y1 - word.bbox.y0) * .45));
    if (!line) { line = { y, words: [] }; groups.push(line); }
    line.words.push(word);
  }
  return groups.sort((a,b) => a.y-b.y).map(row => ({ ...row, text: row.words.sort((a,b) => a.bbox.x0-b.bbox.x0).map(w=>w.text).join(' ') }));
}

const markers = [
  ['gstin', /^GSTIN$/i], ['legal', /^Legal name$/i], ['trade', /^Trade name$/i], ['constitution', /^Constitution$/i],
  ['address', /^Address of principal/i], ['liability', /^Date of liability/i], ['status', /^Registration status/i],
  ['udyam', /^Udyam reg[. ]*number/i], ['enterprise', /^Enterprise name/i], ['activity', /^Major activity/i], ['city', /^City$/i], ['state', /^State$/i], ['registration', /^Date of registration/i],
  ['consumer', /^Consumer no/i], ['billed', /^Billed to$/i], ['address', /^Supply address$/i], ['date', /^Bill date$/i], ['units', /^Units consumed$/i], ['amount', /^Amount due/i]
];
export function parseLocalFields(kind, data, width, height) {
  const words = (data.blocks || []).flatMap(block => block.paragraphs || []).flatMap(p => p.lines || []).flatMap(line => line.words || []);
  const tableWords = words.filter(w => w.bbox.y0 > height * .12 && w.bbox.y0 < height * .55 && Number(w.confidence) >= 35);
  const labels = lines(tableWords.filter(w => w.bbox.x0 < width * .39));
  const rows = labels.map(row => ({ ...row, key: markers.find(([, pattern]) => pattern.test(row.text))?.[0] })).filter(r=>r.key);
  const values = {};
  for (let i=0;i<rows.length;i++) {
    const start = rows[i].y - height * .011, end = rows[i+1] ? rows[i+1].y - height * .011 : rows[i].y + height * .065;
    values[rows[i].key] = lines(tableWords.filter(w=>w.bbox.x0 >= width * .39 && w.bbox.y0 >= start && w.bbox.y0 < end)).map(row=>row.text).join(' ').trim();
  }
  const fields = { businessName:'', gstin:'', udyam:'', address:'', documentDate:'', signatoryName:'', validTill:'', readable:false };
  if (kind === 'gst') { fields.businessName=values.legal||''; fields.gstin=(values.gstin||'').replace(/\s/g,'').toUpperCase(); fields.address=values.address||''; fields.readable=!!(values.legal&&values.gstin); }
  if (kind === 'udyam') { fields.businessName=values.enterprise||''; fields.udyam=(values.udyam||'').replace(/\s/g,'').toUpperCase(); fields.readable=!!(values.enterprise&&values.udyam); }
  if (kind === 'address') { fields.businessName=values.billed||''; fields.address=values.address||''; fields.documentDate=(values.date||'').match(/\d{4}-\d{2}-\d{2}/)?.[0]||''; fields.readable=!!(values.billed&&values.address&&values.date); }
  if (kind === 'signatory') {
    const content = lines(words.filter(w=>w.bbox.x0 > width*.32 && w.bbox.y0 > height*.16 && w.bbox.y0 < height*.8)).map(row=>row.text).join('\n');
    fields.signatoryName=content.match(/(?:^|\n)Name\s*\n([^\n]+)/i)?.[1]?.trim()||'';
    fields.businessName=content.match(/For business\s*\n([^\n]+)/i)?.[1]?.trim()||'';
    fields.validTill=content.match(/Valid till\s*\n(\d{4}-\d{2}-\d{2})/i)?.[1]||'';
    fields.readable=!!(fields.signatoryName&&fields.businessName&&fields.validTill);
  }
  return fields;
}

let active = 0;
export async function extractLocal(documents) {
  if (active >= 2) throw new AppError('Document reader is busy. Please retry shortly.', 503, 'OCR_BUSY');
  active++; let worker, timer, expired=false;
  const task = (async()=>{
    worker = await createWorker('eng', 1, { langPath: english.langPath, gzip:true, cacheMethod:'none', logger:()=>{}, errorHandler:()=>{} });
    if (expired) { await worker.terminate(); throw new Error('OCR timeout'); }
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi:'150' });
    const results=[];
    for (const doc of documents) {
      const bytes=Buffer.from(doc.dataUrl.split(',')[1],'base64'), {width,height}=imageSize(bytes);
      const { data }=await worker.recognize(bytes, {}, { text:true, blocks:true });
      results.push({ kind:doc.kind, fields:parseLocalFields(doc.kind,data,width,height) });
    }
    return results;
  })();
  try { return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new AppError('Document reading timed out. Please use clearer images or retry.',503,'OCR_TIMEOUT'));},45000);})]); }
  finally { clearTimeout(timer); if(worker)await worker.terminate().catch(()=>{}); active--; }
}
