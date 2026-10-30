from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
import pymupdf

out=Path('output/submission');out.mkdir(parents=True,exist_ok=True)
tmp=Path('tmp/submission');tmp.mkdir(parents=True,exist_ok=True)
ink='#173D2D'; red='#B51D24'
styles={
 'title':ParagraphStyle('title',fontName='Helvetica-Bold',fontSize=24,leading=28,textColor=HexColor(ink),spaceAfter=10),
 'sub':ParagraphStyle('sub',fontName='Helvetica',fontSize=10,leading=14,textColor=HexColor('#66736B'),spaceAfter=16),
 'head':ParagraphStyle('head',fontName='Helvetica-Bold',fontSize=11,leading=15,textColor=HexColor(red),spaceBefore=10,spaceAfter=4),
 'body':ParagraphStyle('body',fontName='Helvetica',fontSize=10.3,leading=14,textColor=HexColor('#293C33'),spaceAfter=5),
}
story=[Paragraph('Privacy and security design',styles['title']),Paragraph('Udyam Digital / Accel Business synthetic case / 30 October 2026',styles['sub'])]
sections=[
 ('Purpose and minimum collection','Business type, staff, locations, tools, needs and budget support service recommendations. Checkout requests contact name, mobile number and installation address. Registration identifiers and document images appear only in the consent step. All supplied records are fictional.'),
 ('Consent and document reading','Verification requires versioned consent with a timestamp. The default Tesseract reader uses an installed English model on this computer. Raw images and OCR text stay in memory and are not saved or logged. Users can choose manual review. Optional external image reading requires separate consent and a configured provider supporting images. Groq testing uses local OCR.'),
 ('Live advisor and external processing','The testing advisor sends minimized business context and chat to Groq. Common phone, email and registration patterns are redacted, and the interface asks users to avoid private identifiers. Free text can still contain personal information. The selected provider\'s data policies apply. Switching later to OpenAI requires an explicit server setting and its key; there is no automatic paid fallback.'),
 ('Storage, access and deletion','SQLite stores contacts, quote snapshots, masked identifiers, consent proof and check summaries. A random HttpOnly, SameSite browser cookie restricts orders to its session; the database stores the cookie hash. Records expire with the session after seven days, with cleanup at startup and on requests. Users can delete saved orders earlier. Local SQLite is not encrypted at rest, and browser sessions do not verify legal identity.'),
 ('Safeguards and deployment limits','The server reprices catalogue products, checks dependencies and binds verification to business and contact details. Prepared SQL, same-origin checks, bounded requests/images and a static asset allowlist protect the prototype. Unclear, expired or mismatched documents require review. Field matching does not prove authenticity. Before real customer use, add verified login, HTTPS, encrypted storage, backups, processor agreements, reviewed retention and monitored fulfillment integrations.'),
]
for head,body in sections:story.extend([Paragraph(head,styles['head']),Paragraph(body,styles['body'])])
story.extend([Spacer(1,8),Paragraph('Design note for the hackathon. It addresses the case\'s consent, purpose and minimization requirements and does not certify legal compliance.',styles['sub'])])
SimpleDocTemplate(str(out/'privacy-security-note.pdf'),pagesize=A4,rightMargin=46,leftMargin=46,topMargin=42,bottomMargin=35).build(story)

w,h=landscape(A4);c=canvas.Canvas(str(out/'solution-architecture.pdf'),pagesize=(w,h));c.setTitle('Udyam Digital solution architecture')
c.setFillColor(HexColor(ink));c.setFont('Helvetica-Bold',25);c.drawString(45,h-58,'Udyam Digital solution architecture')
c.setFont('Helvetica',11);c.setFillColor(HexColor('#66736B'));c.drawString(45,h-80,'Local prototype with Groq advisor, catalogue rules, consent and protected orders')
def box(x,y,width,height,title,detail):
 c.setFillColor(HexColor('#F1F5EF'));c.setStrokeColor(HexColor('#AEC0B2'));c.roundRect(x,y,width,height,7,fill=1,stroke=1)
 c.setFillColor(HexColor(ink));c.setFont('Helvetica-Bold',14);c.drawString(x+13,y+height-23,title)
 c.setFont('Helvetica',10)
 for i,line in enumerate(detail.split('\n')):c.drawString(x+13,y+height-43-i*14,line)
def arrow(points):
 c.setStrokeColor(HexColor('#667C6C'));c.setFillColor(HexColor('#667C6C'));c.setLineWidth(1.5)
 p=c.beginPath();p.moveTo(*points[0])
 for point in points[1:]:p.lineTo(*point)
 c.drawPath(p)
 x,y=points[-1];px,py=points[-2]
 if x==px:pts=[(x,y),(x-4,y+(7 if y<py else -7)),(x+4,y+(7 if y<py else -7))]
 else:pts=[(x,y),(x+(7 if x<px else -7),y-4),(x+(7 if x<px else -7),y+4)]
 p=c.beginPath();p.moveTo(*pts[0]);p.lineTo(*pts[1]);p.lineTo(*pts[2]);p.close();c.drawPath(p,fill=1)
box(45,365,205,85,'Mobile browser','English / Hindi journey\nQuotes, consent and tracker')
box(318,365,205,85,'Node HTTP API','Same-origin session access\nValidation and repricing')
box(591,365,205,85,'Groq advisor','Minimized business context\nStructured profile proposals')
box(45,185,205,95,'Catalogue and registries','25 products and mock records\nEligibility and dependencies\nFixed KYC date: 2026-07-15')
box(318,185,205,95,'Local OCR and KYC','Consented English images\nField, registry and date checks\nNo raw-image persistence')
box(591,185,205,95,'SQLite','Session-owned orders\nMasked verification snapshots\nSeven-day session retention')
arrow([(250,407),(318,407)]);arrow([(523,407),(591,407)])
arrow([(363,365),(363,320),(147,320),(147,280)])
arrow([(420,365),(420,280)]);arrow([(477,365),(477,320),(694,320),(694,280)])
c.setFont('Helvetica-Bold',12);c.setFillColor(HexColor(red));c.drawString(45,137,'Honest boundaries')
c.setFont('Helvetica',11);c.setFillColor(HexColor(ink));c.drawString(45,116,'Mock government records. No real installation, payments or partner notifications. Unclear checks require review.')
c.drawString(45,96,'Provider settings allow a later OpenAI evaluation. There is no automatic paid fallback.')
c.setFont('Helvetica',9);c.setFillColor(HexColor('#66736B'));c.drawString(45,48,'Sources: architecture.md, server.mjs and src modules. Synthetic hackathon case.');c.showPage();c.save()
for name in ['privacy-security-note','solution-architecture']:
 d=pymupdf.open(out/(name+'.pdf'))
 if name=='privacy-security-note' and len(d)!=1:raise RuntimeError('Privacy note must be exactly one page')
 d[0].get_pixmap(matrix=pymupdf.Matrix(1.4,1.4)).save(tmp/(name+'.png'))
 print(name+': '+str(len(d))+' page(s)')
