// Empty stub for optional Node-only modules that must never be bundled for the
// browser — currently pdfjs-dist's `require("canvas")` (used only in its Node
// rendering path, which never runs client-side). Aliased via next.config.mjs
// (turbopack.resolveAlias). Intentionally empty.
module.exports = {};
