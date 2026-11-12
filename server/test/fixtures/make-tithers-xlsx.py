"""
Writes tithers.xlsx, the workbook server/test/tithes.test.js uploads.

Run it from anywhere:  python server/test/fixtures/make-tithers-xlsx.py

The sheet is what an office would type into Excel: a header row, then one
tither per row. Two cells are deliberately awkward:
  - the phones on rows 2 and 3 are stored as numbers, so Excel has already
    thrown away the leading zero (244123456, not 0244123456) — the upload
    must put it back;
  - the type on row 3 is "couple" in lower case.
Row 4 has no phone and no type, which the upload treats as an individual
with nothing to text.

openpyxl is the only dependency (pip install openpyxl).
"""
from pathlib import Path

from openpyxl import Workbook

ROWS = [
    ["Tithe Number", "Name", "Phone", "Type", "Spouse Name", "Spouse Phone"],
    ["HPC001", "Kofi Mensah", 244123456, "Individual", None, None],
    ["HPC002", "Yaw Boateng", 201234567, "couple", "Abena Boateng", "0551234567"],
    ["HPC003", "Esi Owusu", None, None, None, None],
]


def main():
    wb = Workbook()
    ws = wb.active
    ws.title = "Tithers"
    for row in ROWS:
        ws.append(row)
    out = Path(__file__).with_name("tithers.xlsx")
    wb.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
