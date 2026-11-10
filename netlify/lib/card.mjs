// Rasterises card-svg to a 1200×630 PNG with resvg (native binary on Netlify's Linux).
import { Resvg } from '@resvg/resvg-js';
import { cardSvg } from './card-svg.mjs';
import { INTER_BOLD_B64 } from './fonts.mjs';

const FONT = Buffer.from(INTER_BOLD_B64, 'base64');
export async function renderCardPng(page) {
  return new Resvg(cardSvg(page), { font: { fontBuffers: [FONT], defaultFontFamily: 'Inter', loadSystemFonts: false }, fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
