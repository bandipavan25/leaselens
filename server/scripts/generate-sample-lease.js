import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pages = [
  {
    heading: "RETAIL SHOPPING CENTER LEASE",
    lines: [
      "This Lease is made as of March 1, 2026, between Northridge Plaza LLC (“Landlord”) and Maple & Thyme Café LLC (“Tenant”).",
      "Premises: Suite 110, 4800 Oakridge Boulevard, Northridge, California, containing approximately 1,850 rentable square feet.",
      "ARTICLE 1. TERM. The Term is five (5) years commencing April 1, 2026 and ending March 31, 2031, unless sooner terminated.",
      "ARTICLE 2. BASE RENT. Tenant shall pay Base Rent of Eight Thousand Five Hundred and 00/100 Dollars ($8,500.00) per month, in advance.",
      "Section 2.2 Escalation. Base Rent shall increase by four percent (4%) on each anniversary of the Commencement Date.",
      "ARTICLE 3. SECURITY DEPOSIT. Tenant shall deposit Twenty-Five Thousand Five Hundred Dollars ($25,500.00) as a Security Deposit. Landlord may apply the deposit to any default. Unused funds shall be returned within sixty (60) days after the later of expiration and Tenant’s surrender.",
    ],
  },
  {
    heading: "ARTICLE 4–7",
    lines: [
      "ARTICLE 4. OPERATING EXPENSES / CAM. Tenant shall pay Tenant’s Pro Rata Share (6.2%) of all Common Area Maintenance and Operating Expenses without cap, including capital improvements amortized over their useful life, Landlord’s administrative fee of fifteen percent (15%), and property taxes. Tenant has no audit right.",
      "ARTICLE 5. USE. Tenant shall use the Premises solely as a casual café serving coffee, tea, and light food, and for no other purpose. Tenant shall remain open at least 10:00 a.m. to 8:00 p.m. daily (continuous operation). No alcohol, live music, or outdoor seating is permitted without Landlord’s prior written consent, which may be withheld in Landlord’s sole discretion.",
      "ARTICLE 6. EXCLUSIVITY. Intentionally omitted. Landlord may lease adjoining space to any food or beverage operator, including coffee concepts.",
      "ARTICLE 7. RADIUS RESTRICTION. During the Term, Tenant shall not own, operate, or have any interest in another café or coffee shop within three (3) miles of the Shopping Center. Breach is a material default and Landlord may recover lost percentage rent.",
    ],
  },
  {
    heading: "ARTICLE 8–11",
    lines: [
      "ARTICLE 8. ASSIGNMENT AND SUBLETTING. Tenant shall not assign this Lease or sublet any portion of the Premises without Landlord’s prior written consent, which may be granted or withheld in Landlord’s sole and absolute discretion. Landlord may recapture the Premises instead of consenting. Any profit from assignment or subletting belongs entirely to Landlord. A change in control of Tenant is an assignment.",
      "ARTICLE 9. RENEWAL. Provided Tenant is not in default, Tenant may renew for one (1) additional period of five (5) years at then-fair market rent as determined solely by Landlord. Tenant must give written notice of exercise at least two hundred seventy (270) days, and not more than three hundred sixty-five (365) days, before expiration. There is no automatic renewal.",
      "ARTICLE 10. RELOCATION. Landlord may relocate Tenant to other space in the Center upon sixty (60) days’ notice. Landlord shall pay reasonable moving costs only. The substitute premises need not be of equal visibility or frontage. Rent shall not decrease if the substitute space is smaller.",
      "ARTICLE 11. MAINTENANCE AND REPAIRS. Tenant shall maintain and repair the Premises, including HVAC, plumbing, electrical, plate glass, and the storefront, at Tenant’s sole cost. Landlord is responsible only for the structural roof and exterior walls, excluding glass. Tenant shall replace HVAC if repair costs exceed 50% of replacement cost.",
    ],
  },
  {
    heading: "ARTICLE 12–16",
    lines: [
      "ARTICLE 12. INSURANCE. Tenant shall carry commercial general liability insurance of at least $2,000,000 per occurrence, special-form property insurance, workers’ compensation, and business interruption. Landlord and its lender shall be named additional insureds. Tenant waives subrogation.",
      "ARTICLE 13. DEFAULT AND REMEDIES. Tenant is in default if rent is late by more than three (3) days, or if any other covenant is not cured within five (5) days after notice. Upon default, Landlord may terminate, accelerate all rent for the remainder of the Term, lock out Tenant without judicial process, and recover attorneys’ fees. No additional cure period applies to a second default.",
      "ARTICLE 14. HOLDOVER. If Tenant remains after expiration, Tenant becomes a tenant at sufferance and shall pay 200% of the then-current Base Rent plus Operating Expenses, and shall indemnify Landlord for consequential damages, including lost replacement tenants.",
      "ARTICLE 15. EARLY TERMINATION. Tenant has no right to terminate this Lease early. Destruction of the Premises does not abate rent unless Landlord elects not to rebuild.",
      "ARTICLE 16. PERSONAL GUARANTEE. Priya Shah, as Guarantor, absolutely and unconditionally guarantees all of Tenant’s obligations, including rent, CAM, holdover, and indemnity, without limitation as to amount or duration. Landlord need not first proceed against Tenant. This Guarantee does not burn off.",
      "IN WITNESS WHEREOF, the parties have executed this Lease as of the date first written above.",
    ],
  },
];

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);

  for (const [index, pageContent] of pages.entries()) {
    const page = doc.addPage([612, 792]);
    const { width, height } = page.getSize();
    page.drawText("COMMERCIAL LEASE AGREEMENT", {
      x: 72,
      y: height - 54,
      size: 11,
      font: bold,
      color: rgb(0.15, 0.12, 0.1),
    });
    page.drawText(pageContent.heading, {
      x: 72,
      y: height - 78,
      size: 13,
      font: bold,
      color: rgb(0.15, 0.12, 0.1),
    });

    let y = height - 110;
    for (const paragraph of pageContent.lines) {
      const wrapped = wrapText(paragraph, font, 11, width - 144);
      for (const line of wrapped) {
        if (y < 72) break;
        page.drawText(line, {
          x: 72,
          y,
          size: 11,
          font,
          color: rgb(0.12, 0.1, 0.08),
        });
        y -= 16;
      }
      y -= 10;
    }

    page.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: width - 140,
      y: 40,
      size: 9,
      font,
      color: rgb(0.4, 0.38, 0.35),
    });
  }

  const bytes = await doc.save();
  const outDir = path.join(__dirname, "..", "fixtures");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "sample-commercial-lease.pdf");
  await writeFile(outPath, bytes);
  console.log(`Wrote ${outPath}`);
}

function wrapText(text, font, size, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
