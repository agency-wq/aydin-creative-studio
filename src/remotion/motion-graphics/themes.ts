// Themes per motion graphics templates.
// Re-export di `themes-data.ts` (puro) + side-effect: pre-carica i font Google
// usati dai template (Montserrat per Infographics Show ecc.).
//
// I componenti Remotion devono importare da QUI per garantire che i font siano
// registrati. Il frontend Next.js (form, dashboard) deve invece importare da
// `themes-data.ts` cosi da non trascinare nel bundle l'API @remotion/google-fonts.

import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

// Pre-load Montserrat (Remotion la registra una volta sola)
loadMontserrat();

export type { MGTheme } from "./themes-data";
export { MG_THEMES, DEFAULT_THEME, getTheme, listThemeNames } from "./themes-data";
