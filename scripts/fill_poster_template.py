from __future__ import annotations

import shutil
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont


SOURCE_PPTX = Path(r"C:\Users\taha\Downloads\2025-Bitirme-Proje-Sergisi-Poster-Sablonu_choladeck (2).pptx")
OUTPUT_PPTX = Path(r"C:\Users\taha\Desktop\mcp-city-agent\output\mcp-city-agent-poster.pptx")
SLIDE_XML = "ppt/slides/slide1.xml"
RESULT_IMAGE = Path(r"C:\Users\taha\Desktop\mcp-city-agent\output\poster-results.png")

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}


REPLACEMENTS = {
    0: "MCP City Agent",
    3: (
        "İBB Açık Veri portalında yüzlerce veri seti bulunur. Bu çalışma, doğru veri setini "
        "bulmayı ve uygun erişim yolunu seçmeyi kolaylaştıran bir şehir ajanı geliştirmektedir."
    ),
    4: (
        "Sistem Node.js/TypeScript ile geliştirildi. Mimari; CKAN katalog erişimi, capability "
        "analizi, veri önizleme, profiling ve LLM destekli yorumlama katmanlarından oluşur."
    ),
    6: "Taha",
    8: "İş akışı",
    9: "Soru -> dataset seçimi -> capability -> preview",
    10: "-> analiz -> kullanıcı çıktısı",
    12: (
        "Ajan; arama, metadata inceleme, profiling, mekansal alan tespiti ve doğal dil analizi "
        "işlevlerini tek yapıda birleştirmiştir. Web arayüzü ve MCP araçları aynı katalog üzerinde "
        "çalışmaktadır."
    ),
    14: (
        "Şekil 2. Sistem çıktısı: katalog tarama, capability tespiti, preview ve LLM desteği."
    ),
    16: (
        "Temel modüller: CKAN katalogu, MCP araçları, web arayüzü ve LLM destekli analiz."
    ),
    17: "CKAN",
    18: "",
    19: "MCP",
    20: "",
    21: "WEB",
    22: "",
    24: "LLM",
    25: "",
    26: (
        "Çalışma, açık veri keşfini hızlandıran ölçeklenebilir bir ajan yaklaşımı sunmuştur. "
        "Gelecekte embedding tabanlı discovery, cache ve rapor üretimi eklenebilir."
    ),
    27: "Katalog tarama",
    28: "Yetenek çıkarımı",
    29: "Veri önizleme",
    30: "LLM analizi",
    32: (
        "İBB Açık Veri portalına ve projeye katkı sunan danışmanlara teşekkür ederim."
    ),
    34: (
        "İBB Açık Veri Portalı; CKAN API; Model Context Protocol; OpenAI uyumlu API dokümanları."
    ),
    36: (
        "Bu çalışma, İBB Açık Veri portalındaki veri setlerini web arayüzü ve MCP araçları ile "
        "erişilebilir hale getiren metadata odaklı bir şehir ajanı sunmaktadır. Sistem, kullanıcı "
        "sorusunu uygun veri setleriyle eşleştirir, erişim yolunu belirler ve gerektiğinde LLM "
        "destekli özet üretir."
    ),
    39: "MCP CITY AGENT POSTERİ",
    40: "API",
    41: "",
}


def build_result_image() -> None:
    RESULT_IMAGE.parent.mkdir(parents=True, exist_ok=True)
    width, height = 980, 1080
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    blue = (38, 96, 150)
    mid = (94, 156, 214)
    pale = (232, 244, 255)
    text = (34, 44, 56)

    try:
        font_title = ImageFont.truetype("arial.ttf", 42)
        font_sub = ImageFont.truetype("arial.ttf", 28)
        font_body = ImageFont.truetype("arial.ttf", 24)
        font_num = ImageFont.truetype("arial.ttf", 44)
    except OSError:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        font_body = ImageFont.load_default()
        font_num = ImageFont.load_default()

    draw.rounded_rectangle((20, 20, width - 20, height - 20), radius=28, outline=blue, width=4, fill="white")
    draw.text((50, 45), "Sistem Ciktilari", fill=blue, font=font_title)
    draw.text((50, 105), "Ajanin kapsadigi temel islevler", fill=text, font=font_sub)

    cards = [
        ("Katalog", "CKAN metadata arama\nve veri seti secimi"),
        ("Capability", "Datastore, dosya\nve API tespiti"),
        ("Preview", "Ornek kayitlar ve\nresource profiling"),
        ("Analiz", "LLM destekli yorum\nve karar destegi"),
    ]
    y = 180
    for title, body in cards:
        draw.rounded_rectangle((50, y, 430, y + 150), radius=24, fill=pale, outline=blue, width=3)
        draw.text((75, y + 22), title, fill=blue, font=font_sub)
        draw.multiline_text((75, y + 68), body, fill=text, font=font_body, spacing=8)
        y += 175

    draw.text((560, 190), "Odak Alanlari", fill=blue, font=font_sub)
    bars = [
        ("CKAN", 88),
        ("MCP", 76),
        ("WEB", 82),
        ("LLM", 69),
    ]
    base_y = 860
    x = 540
    for label, value in bars:
        bar_h = int(value * 4.8)
        draw.rounded_rectangle((x, base_y - bar_h, x + 90, base_y), radius=16, fill=mid)
        draw.text((x + 18, base_y + 18), label, fill=text, font=font_body)
        draw.text((x + 18, base_y - bar_h - 56), str(value), fill=blue, font=font_num)
        x += 105

    draw.line((520, base_y, 900, base_y), fill=(180, 200, 220), width=3)
    draw.multiline_text(
        (525, 925),
        "Moduller birlikte\ncalisarak veri kesfini\nhizlandirir.",
        fill=text,
        font=font_body,
        spacing=6,
    )
    image.save(RESULT_IMAGE)


def main() -> None:
    build_result_image()
    OUTPUT_PPTX.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE_PPTX, OUTPUT_PPTX)

    with zipfile.ZipFile(OUTPUT_PPTX, "a") as zf:
        xml_bytes = zf.read(SLIDE_XML)
        root = ET.fromstring(xml_bytes)
        text_nodes = [n for n in root.findall(".//a:t", NS) if (n.text or "").strip()]

        for index, value in REPLACEMENTS.items():
            if index >= len(text_nodes):
                raise IndexError(f"text index {index} not found in slide xml")
            text_nodes[index].text = value

        new_xml = ET.tostring(root, encoding="utf-8", xml_declaration=True)
        # Rebuild the archive to avoid duplicate entries.
        temp_pptx = OUTPUT_PPTX.with_suffix(".tmp.pptx")
        with zipfile.ZipFile(temp_pptx, "w", compression=zipfile.ZIP_DEFLATED) as out_zip:
            for info in zf.infolist():
                if info.filename == SLIDE_XML:
                    out_zip.writestr(SLIDE_XML, new_xml)
                elif info.filename == "ppt/media/image3.png":
                    out_zip.write(RESULT_IMAGE, "ppt/media/image3.png")
                else:
                    out_zip.writestr(info, zf.read(info.filename))

    temp_pptx.replace(OUTPUT_PPTX)
    print(OUTPUT_PPTX)


if __name__ == "__main__":
    main()
