/**
 * NotebookLM Enhancer - Layout Engine
 */
var LayoutEngine = {
  // Core method for accurately aligning to the size and position of the native scroll area
  syncContainerSize(manager) {
    const container = document.getElementById('nb-ext-container');
    const toolbars = document.querySelectorAll('.nb-ext-toolbar');
    const scrollArea = document.querySelector('.scroll-area-desktop') || document.querySelector('.mat-drawer-inner-container');
    const sidebarContent = scrollArea ? scrollArea.parentElement : document.querySelector('[class*="source-panel"]');

    const isMainListView = ViewDetector.isMainListView(manager);
    const isNativeCollapsed = ViewDetector.isNativeCollapsed();

    // Self-healing logic - If it should be displayed but container is missing (e.g., destroyed by native), trigger recovery
    if (isMainListView && !isNativeCollapsed && !container && scrollArea && scrollArea.offsetWidth >= 150) {
      console.log("[NB-Ext] Container missing in active view, triggering recovery...");
      manager.refreshData(true);
      return;
    }

    if (scrollArea && sidebarContent && container) {
      const targetRect = scrollArea.getBoundingClientRect();
      const parentRect = sidebarContent.getBoundingClientRect();
      const width = targetRect.width;

      if (width >= 150 && !isNativeCollapsed && isMainListView) {
        document.body.classList.remove('nb-ext-is-collapsed');
        container.style.display = 'flex';
        toolbars.forEach(t => t.style.removeProperty('display'));
        
        // Atomic synchronization to mask native content
        scrollArea.style.visibility = 'hidden';

        if (getComputedStyle(sidebarContent).position === 'static') {
          sidebarContent.style.position = 'relative';
        }
        container.style.top = `${targetRect.top - parentRect.top}px`;
        container.style.left = `${targetRect.left - parentRect.left}px`;
        container.style.width = `${targetRect.width}px`;
        container.style.height = `${targetRect.height}px`;
      } else {
        if (width > 0 && isNativeCollapsed) document.body.classList.add('nb-ext-is-collapsed');
        container.style.display = 'none';
        toolbars.forEach(t => t.style.setProperty('display', 'none', 'important'));
        scrollArea.style.visibility = 'visible';
      }
    } else {
      // Toolbar hiding logic only when determined as "non-list view"
      if (!isMainListView || isNativeCollapsed) {
        toolbars.forEach(t => t.style.setProperty('display', 'none', 'important'));
      }
      if (container) container.style.display = 'none';
      if (scrollArea) scrollArea.style.visibility = 'visible';
    }
  },

  updateSearchPanelPosition(manager) {
    const panel = document.getElementById('nb-ext-search-panel');
    const sidebarContent = document.querySelector('.source-panel-content');
    if (panel && sidebarContent) {
      const rect = sidebarContent.getBoundingClientRect();
      const targetWidth = rect.width - 16;
      panel.style.width = `${targetWidth}px`;
      panel.style.left = `${rect.left + 8}px`;
      panel.style.bottom = '20px';
    }
  },

  initSidebarObserver(manager, target) {
    if (manager.sidebarObserver) return;
    manager.sidebarObserver = new ResizeObserver(() => {
      this.updateSearchPanelPosition(manager);
    });
    manager.sidebarObserver.observe(target);
  }
};
