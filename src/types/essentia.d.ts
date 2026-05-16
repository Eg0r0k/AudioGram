declare module "essentia.js/dist/essentia.js-core.es.js" {
  import type Essentia from "essentia.js/dist/core_api";
  const EssentiaClass: new (wasmModule: unknown) => Essentia;
  export default EssentiaClass;
}

declare module "essentia.js/dist/essentia-wasm.es.js" {
  const EssentiaWASM: unknown;
  export { EssentiaWASM };
}
