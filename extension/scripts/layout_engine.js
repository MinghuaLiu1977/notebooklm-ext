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
        container.style.height = 'auto';
        container.style.maxHeight = `${targetRect.height}px`;

        // Shell positioning (Toolbar + Search)
        if (shell) {
          shell.style.visibility = 'visible';
          shell.classList.remove('nb-ext-shell-collapsed');
          shell.style.left = `${targetRect.left}px`;
          shell.style.width = `${targetRect.width}px`;
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
           const isStandby = !ToolbarManager.isToolbarEnabled;
           
           // If collapsed, we hide the shell regardless of standby status to avoid "white circle" ghosting
           if (isNativeCollapsed) {
             shell.style.visibility = 'hidden';
             shell.classList.add('nb-ext-shell-collapsed');
           } else {
             shell.style.visibility = 'visible';
             shell.classList.remove('nb-ext-shell-collapsed');
             if (isStandby) {
               shell.style.left = '16px'; 
               shell.style.width = '40px';
               shell.style.bottom = '24px';
             }
           }
         }
      } else {
         // On non-notebook pages or non-list views, we check if we should still show standby
         const isNotebook = window.location.href.includes('/notebook/');
         // Only show standby in notebook pages IF the panel is not collapsed
         if (isNotebook && shell && !isNativeCollapsed) {
           shell.style.visibility = 'visible';
           shell.classList.remove('nb-ext-shell-collapsed');
           shell.style.left = '16px';
           shell.style.bottom = '24px';
           shell.style.width = '40px';
         } else if (shell) {
           shell.style.visibility = 'hidden';
           shell.classList.add('nb-ext-shell-collapsed');
         }
        }
      }
    } else {
      // Recovery or Unsupported View
      const isMainListView = ViewDetector.isMainListView(manager);
      const isNativeCollapsed = ViewDetector.isNativeCollapsed();

      if (!isMainListView || isNativeCollapsed) {
        // Only hide toolbars if we are NOT in a notebook page
        // If in notebook, we want to at least show the standby button
        const isNotebook = window.location.href.includes('/notebook/');
        if (!isNotebook) {
            toolbars.forEach(t => t.style.setProperty('display', 'none', 'important'));
        }

        if (shell) {
          if (!isNotebook) {
            shell.style.visibility = 'hidden';
            shell.classList.add('nb-ext-shell-collapsed');
          }
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
