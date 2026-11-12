export type SignatureFont = { id: string; name: string; family: string; scale: number };

export const SIGNATURE_FONT_KEY = "clumsy.signatureFont";

export const signatureFonts: SignatureFont[] = [
  { id: "mrs-saint-delafield", name: "Mrs Saint Delafield", family: '"Mrs Saint Delafield", cursive', scale: 1.25 },
  { id: "herr-von-muellerhoff", name: "Herr Von Muellerhoff", family: '"Herr Von Muellerhoff", cursive', scale: 1.3 },
  { id: "monsieur-la-doulaise", name: "Monsieur La Doulaise", family: '"Monsieur La Doulaise", cursive', scale: 1.2 },
  { id: "la-belle-aurore", name: "La Belle Aurore", family: '"La Belle Aurore", cursive', scale: 0.9 },
  { id: "great-vibes", name: "Great Vibes", family: '"Great Vibes", cursive', scale: 1.05 },
  { id: "pinyon-script", name: "Pinyon Script", family: '"Pinyon Script", cursive', scale: 0.95 },
  { id: "alex-brush", name: "Alex Brush", family: '"Alex Brush", cursive', scale: 1.05 },
  { id: "parisienne", name: "Parisienne", family: '"Parisienne", cursive', scale: 1 },
  { id: "allura", name: "Allura", family: '"Allura", cursive', scale: 1.1 },
  { id: "sacramento", name: "Sacramento", family: '"Sacramento", cursive', scale: 1.15 },
  { id: "kristi", name: "Kristi", family: '"Kristi", cursive', scale: 1.2 },
  { id: "dancing-script", name: "Dancing Script", family: '"Dancing Script", cursive', scale: 0.95 },
  { id: "homemade-apple", name: "Homemade Apple", family: '"Homemade Apple", cursive', scale: 0.7 },
  { id: "cedarville-cursive", name: "Cedarville Cursive", family: '"Cedarville Cursive", cursive', scale: 0.85 },
  { id: "nothing-you-could-do", name: "Nothing You Could Do", family: '"Nothing You Could Do", cursive', scale: 0.8 },
  { id: "caveat", name: "Caveat", family: '"Caveat", cursive', scale: 1.05 },
];

export function signatureFont(id: unknown) {
  return signatureFonts.find((font) => font.id === id) ?? signatureFonts[0];
}
