import fitz
import os

pdf_path = r"C:\Users\User\Projects\Jotril-web\jotril-web\Jotril_Report_ARMOR Progress Report (April 2026).pdf"
out_dir = r"C:\Users\User\.gemini\antigravity\brain\de03c919-e23d-464c-9638-7a23a1b4750b"

doc = fitz.open(pdf_path)
for i in range(min(4, len(doc))):
    page = doc.load_page(i)
    pix = page.get_pixmap(dpi=150)
    out_file = os.path.join(out_dir, f"pdf_page_{i}.png")
    pix.save(out_file)
    print(f"Saved {out_file}")
