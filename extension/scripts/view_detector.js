/**
 * NotebookLM Enhancer - View Detector
 * Simplified logic: judge whether to display only based on the existence of specific DOM nodes.
 */
var ViewDetector = {
  /**
   * Simple judgment logic: whether the list scroll area exists
   * @returns {Boolean}
   */
  isMainListView() {
    // Key characteristic nodes
    const scrollArea = document.querySelector('.scroll-area-desktop');
    
    // If the node exists, it is considered to be in the main list view
    const result = !!scrollArea;
    return result;
  },

  /**
   * Check if the sidebar is natively collapsed
   */
  isNativeCollapsed() {
    const nativeHeader = document.querySelector('[class*="panel-header"]');
    const scrollArea = document.querySelector('.scroll-area-desktop');
    
    // 1. Class name judgment
    const hasCollapsedClass = nativeHeader && (
      nativeHeader.classList.contains('panel-header-collapsed') || 
      nativeHeader.parentElement?.classList.contains('panel-header-collapsed')
    );

    // 2. Width judgment (redundancy guarantee): If the scroll area width is very small, it must be in a collapsed state
    const isTinyWidth = scrollArea && scrollArea.offsetWidth < 50;

    return !!(hasCollapsedClass || isTinyWidth);
  }
};
