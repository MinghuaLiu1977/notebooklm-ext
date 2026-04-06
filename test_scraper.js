const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');

const dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <!-- MOCK DOM OF NOTEBOOKLM -->
  <div class="scroll-area-desktop">
  
    <!-- Healthy Item -->
    <div class="mat-mdc-list-item">
       <input type="checkbox" />
       <button class="source-stretched-button" aria-label="Healthy Source"></button>
    </div>

    <!-- Failed Item (with error container) -->
    <div class="mat-mdc-list-item">
       <div class="single-source-error-container">Failed to parse</div>
       <input type="checkbox" />
       <button class="source-stretched-button" aria-label="Error Source"></button>
    </div>
    
  </div>
</body>
</html>`);

const window = dom.window;
const document = window.document;

const contentJS = fs.readFileSync('extension/scripts/content.js', 'utf8');

// We need to inject minimal mock environments since content.js tries to listen to Chrome API etc.
const script = `
  const chrome = { runtime: { getURL: () => '' } };
  class MutationObserver { observe() {} disconnect() {} }
  const StorageManager = { getLicenseInfo: async () => ({}) };
  const UIRenderer = { renderSidebarUI: () => {} };
  ${contentJS}
`;

try {
  window.eval(script);
  // Extracted sources logic should exist here but because it's wrapped in NotebookManager we need to instantiate it.
  const evalHarness = `
    const manager = Object.create(NotebookManager);
    manager.isInitialized = true;
    manager.sources = [];
    manager.scanDom();
    manager.sources;
  `;
  const result = window.eval(evalHarness);
  console.log("Extraction Result:");
  result.forEach(s => {
    console.log(`- Name: ${s.name}, isUnavailable: ${s.isUnavailable}`);
  });
} catch(e) {
  console.error("Test error", e);
}
