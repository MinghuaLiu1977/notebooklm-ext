/**
 * NotebookLM Enhancer - Layout Engine
 */
var LayoutEngine = {
  // Core method for accurately aligning to the size and position of the native scroll area
  syncContainerSize(manager) {
    const container = document.getElementById('nb-ext-container');
    const toolbars = document.querySelectorAll('.nb-ext-toolbar');
    const shell = document.querySelector('.nb-ext-floating-shell');
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
      const sourcePanel = document.querySelector('[class*="source-panel"]') || document.querySelector('.source-panel-content');
      const isPanelVisible = !!(sourcePanel && sourcePanel.offsetWidth > 0);
      const isToolbarEnabled = ToolbarManager.isToolbarEnabled;

      if (width >= 150 && !isNativeCollapsed && isMainListView && isPanelVisible && isToolbarEnabled) {
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

        // Shell positioning (Toolbar + Search)
        if (shell) {
          shell.style.visibility = 'visible';
          shell.classList.remove('nb-ext-shell-collapsed');
          shell.style.left = `${targetRect.left + 16}px`;
          shell.style.width = `${targetRect.width - 32}px`;
          shell.style.bottom = '24px';
        }
      } else {
        // Standby or Unsupported state
        if (width > 0 && isNativeCollapsed) document.body.classList.add('nb-ext-is-collapsed');
        
        container.style.setProperty('display', 'none', 'important');
        scrollArea.style.visibility = 'visible';

        if (isMainListView) {
           // Allow shell (toolbar icon) to be visible even if collapsed/hidden
           if (shell) {
             if (isNativeCollapsed) {
               shell.style.visibility = 'hidden'; // Hide shell, CSS will show icon
               shell.classList.add('nb-ext-shell-collapsed');
               shell.style.left = '12px';
               shell.style.width = 'auto';
             } else {
               shell.style.visibility = 'visible';
               shell.classList.remove('nb-ext-shell-collapsed');
             }
           }
        } else {
           if (shell) shell.style.visibility = 'hidden';
        }
      }
    } else {
      // Recovery or Unsupported View
      const isMainListView = ViewDetector.isMainListView(manager);
      const isNativeCollapsed = ViewDetector.isNativeCollapsed();

      if (!isMainListView || isNativeCollapsed) {
        toolbars.forEach(t => t.style.setProperty('display', 'none', 'important'));
        if (shell) {
          shell.style.visibility = 'hidden';
          shell.classList.add('nb-ext-shell-collapsed');
        }
      }
      if (container) container.style.display = 'none';
      if (scrollArea) scrollArea.style.visibility = 'visible';
    }
  },

  initSidebarObserver(manager, target) {
    if (manager.sidebarObserver) return;
    manager.sidebarObserver = new ResizeObserver(() => {
      this.syncContainerSize(manager);
    });
    manager.sidebarObserver.observe(target);
  }
};
