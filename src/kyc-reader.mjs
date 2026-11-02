import {prepareDocuments} from './pdf.mjs';
import {extractLocal,parseTextFields} from './ocr.mjs';
import {extract} from './ai.mjs';
export const needed={gst:['businessName','gstin'],udyam:['businessName','udyam'],address:['businessName','address','documentDate'],signatory:['signatoryName']};
export async function readDocument(doc,method='local',config={}){
 try{
  const pages=await prepareDocuments([doc]),merged={},confidences=[],methods=new Set(),conflicts=[];
  for(const page of pages){
   const textFields=page.text?parseTextFields(doc.kind,page.text):null;
   let fields=textFields;
   if(textFields?.readable)methods.add('pdf_text');
   else if(method==='ai'){fields=await extract(config,page);methods.add('external_ai');}
   else {const r=(await extractLocal([page]))[0];fields={...textFields,...r.fields};if(Number.isFinite(r.confidence))confidences.push(r.confidence);methods.add('local_ocr');}
   for(const [k,value]of Object.entries(fields||{}))if(k!=='readable'&&value){if(['gstin','udyam'].includes(k)&&merged[k]&&merged[k]!==value)conflicts.push(k);if(!merged[k])merged[k]=value;}
  }
  const missing=needed[doc.kind].filter(k=>!merged[k]);
  merged.readable=!missing.length&&!conflicts.length;
  return {kind:doc.kind,fields:merged,confidence:confidences.length?Math.round(confidences.reduce((a,b)=>a+b,0)/confidences.length):null,method:[...methods].join('+'),pageCount:pages.length,preview:pages[0]?.dataUrl||doc.dataUrl,missingFields:missing,conflicts,extractionStatus:merged.readable?'extracted':Object.keys(merged).some(k=>k!=='readable')?'partially_extracted':'extraction_failed'};
 }catch(error){
  const code=error.code==='OCR_TIMEOUT'?'OCR_TIMEOUT':error.code==='OCR_BUSY'?'OCR_BUSY':error.name==='PasswordException'?'PDF_PASSWORD_REQUIRED':error.name==='InvalidPDFException'?'INVALID_PDF':/pages per document/.test(error.message)?'PDF_PAGE_LIMIT':/page size/.test(error.message)?'PDF_PAGE_SIZE':'DOCUMENT_READER_FAILED';
  const reasons={OCR_TIMEOUT:'Local reading timed out. Upload a clearer or smaller scan and retry.',OCR_BUSY:'The local reader is busy. Retry shortly.',PDF_PASSWORD_REQUIRED:'This PDF is password-protected. Upload an unlocked copy.',INVALID_PDF:'The PDF could not be opened. Export it again or upload an image.',PDF_PAGE_LIMIT:'Use no more than four pages in each PDF.',PDF_PAGE_SIZE:'This PDF page has unsupported dimensions. Export it at a normal page size.',DOCUMENT_READER_FAILED:'The file could not be read. Try a new PDF export or a clear JPEG/PNG.'};
  return {kind:doc.kind,fields:null,confidence:null,method:method==='ai'?'external_ai':'local',extractionStatus:'extraction_failed',errorCode:code,errorMessage:reasons[code],missingFields:needed[doc.kind],conflicts:[]};
 }
}
export async function readDocuments(documents,method,config){const rows=[];for(const doc of documents)rows.push(await readDocument(doc,method,config));return rows;}
