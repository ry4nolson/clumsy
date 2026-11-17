import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { propertySections, type PropertySection } from "../lib/documentProperties";
import { readProperties, type PropertiesContext } from "../lib/readProperties";

type PropertiesPanelProps = { pdfDocument: PDFDocumentProxy } & PropertiesContext;

export function PropertiesPanel({ pdfDocument, name, path, pageNumber, passwordToOpen, hasForm, attachments, layers }: PropertiesPanelProps) {
  const [sections, setSections] = useState<PropertySection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    readProperties(pdfDocument, { name, path, pageNumber, passwordToOpen, hasForm, attachments, layers })
      .then((input) => {
        if (!cancelled) {
          setSections(propertySections(input, navigator.language));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pdfDocument, name, path, pageNumber, passwordToOpen, hasForm, attachments, layers]);

  if (!sections) {
    return null;
  }
  return (
    <div className="document-properties">
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <dl className="property-rows">
            {section.rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
