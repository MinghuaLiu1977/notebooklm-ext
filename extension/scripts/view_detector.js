/**
 * NotebookLM Enhancer - View Detector
 * Final refined version based on user's strict 3-condition visibility rules.
 */
var ViewDetector = {
  /**
   * Check if we are currently in the main list view (Sources sidebar visible)
   */
  isMainListView() {
    // Characterize the main list by its scroll containers
    const scrollArea = document.querySelector('.scroll-area-desktop') || 
                       document.querySelector('.mat-drawer-inner-container') ||
                       document.querySelector('[class*="source-panel-content" i]');
    
    // A visible scroll area usually means we are in the main list
    const result = !!(scrollArea && (scrollArea.offsetWidth > 0 || scrollArea.offsetHeight > 0));
    return result;
  },

  /**
   * Check if the sidebar is natively collapsed or hidden
   * Rule 3: Hide if an element has BOTH 'source-panel' and 'panel-collapsed'
   */
  isNativeCollapsed() {
    // 1. Strict user-defined check for combined classes
    const isSidebarCollapsed = !!document.querySelector('.source-panel.panel-collapsed');
    if (isSidebarCollapsed) return true;

    // 2. Fallback: If no sidebar exists at all in the DOM, it's effectively hidden
    const sidebar = document.querySelector('.mat-drawer') || 
                    document.querySelector('.source-panel') ||
                    document.querySelector('.scroll-area-desktop');
    if (!sidebar) return true;

    // 3. Physical check for robustness (Collapsed sidebar is usually very narrow)
    return sidebar.offsetWidth > 0 && sidebar.offsetWidth < 100;
  },

  /**
   * Check if we are currently in a view that should HIDE the toolbar
   * Rules 1 & 2: Hide if '.source-panel-view-content' or 'aria-modal="true"' is present.
   */
  isDocumentView() {
    const isNotebook = window.location.href.includes('/notebook/');
    if (!isNotebook) return false;

    // Rule 1: Hide if Source detail is expanded
    const hasSourceViewContent = !!document.querySelector('.source-panel-view-content');
    
    // Rule 2: Hide if any modal/dialog is active
    const hasAriaModal = !!document.querySelector('[aria-modal="true"]');

    // (Internal) Safety Check: Artifact viewers often trigger hide anyway
    const hasArtifactViewer = !!document.querySelector('lb-artifact-viewer, lb-slide-deck, lb-mind-map');
    
    const result = hasSourceViewContent || hasAriaModal || hasArtifactViewer;
    
    if (result) {
      console.log("[NB-Ext] Hide triggered:", { hasSourceViewContent, hasAriaModal, hasArtifactViewer });
    }
    return result;
  }
};
