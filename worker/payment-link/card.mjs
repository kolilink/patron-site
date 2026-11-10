// Worker-only: rasterises card-svg with resvg (WebAssembly). The wasm and the two font files are bundled by wrangler.
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import bold from './fonts/Inter_700Bold.ttf';
import regular from './fonts/Inter_400Regular.ttf';
import { cardSvg } from './card-svg.mjs';

let ready;
export async function renderCardPng(page) {
  ready ??= initWasm(wasm);
  await ready;
  const r = new Resvg(cardSvg(page), { font: { fontBuffers: [new Uint8Array(bold), new Uint8Array(regular)], defaultFontFamily: 'Inter', loadSystemFonts: false }, fitTo: { mode: 'width', value: 1200 } });
  return r.render().asPng();
}
