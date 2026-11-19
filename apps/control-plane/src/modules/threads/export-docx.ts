import type { ChatMessage } from "@aven/protocol/types";
import { strToU8, zipSync } from "fflate";

import { transcriptOf } from "./transcript";
import type { TranscriptEntry } from "./types";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Reasoning"><w:name w:val="Reasoning"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="666666"/></w:rPr></w:style></w:styles>`;

const MONO = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>';

function escapeXml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function runs(text: string, mono: boolean) {
  return text
    .split("\n")
    .map((line, index) => {
      const properties = mono ? `<w:rPr>${MONO}</w:rPr>` : "";
      const lineBreak = index === 0 ? "" : "<w:br/>";
      return `<w:r>${properties}${lineBreak}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`;
    })
    .join("");
}

function paragraph(style: string, content: string) {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${content}</w:p>`;
}

function entryParagraph(entry: TranscriptEntry) {
  if (entry.kind === "heading")
    return paragraph(entry.level === 1 ? "Heading1" : "Heading2", runs(entry.text, false));

  if (entry.kind === "reasoning") return paragraph("Reasoning", runs(entry.text, false));

  if (entry.kind === "prose") return paragraph("Normal", runs(entry.text, false));

  const code = entry.code ? runs(entry.code, true) : "";
  const text = runs(`${entry.code ? " " : ""}${entry.text}`, false);
  return paragraph("Normal", `${runs("• ", false)}${code}${text}`);
}

export function threadDocx(title: string, messages: readonly ChatMessage[]): Uint8Array {
  const body = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
    transcriptOf(title, messages).map(entryParagraph).join(""),
    "<w:sectPr/></w:body></w:document>",
  ].join("");

  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(PACKAGE_RELS),
      "word/_rels/document.xml.rels": strToU8(DOCUMENT_RELS),
      "word/document.xml": strToU8(body),
      "word/styles.xml": strToU8(STYLES),
    },
    { level: 6 },
  );
}
