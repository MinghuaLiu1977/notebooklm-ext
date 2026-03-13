/**
 * NotebookLM Enhancer - Toolbar Manager
 */
var ToolbarManager = {
  initToolbar(manager, container) {
    console.log("[NB-Ext] ToolbarManager: initToolbar started");
    let nativeHeader = document.querySelector('[class*="panel-header"]');
    
    // If panel-header class is not found, use fallback logic
    if (!nativeHeader) {
      const allButtons = document.querySelectorAll('button');
      for (const btn of allButtons) {
        if (NotebookUtils.isMainListTitle?.(btn.innerText)) {
          nativeHeader = btn.closest('[class*="header"]') || btn.closest('[class*="panel-header"]') || btn.parentElement;
          if (nativeHeader) break;
        }
      }
    }

    let toolbar = nativeHeader ? nativeHeader.querySelector('.nb-ext-toolbar') : container.querySelector('.nb-ext-toolbar');
    
    if (nativeHeader && !toolbar) {
      console.log("[NB-Ext] ToolbarManager: Attaching to native header");
      toolbar = document.createElement('div');
      toolbar.className = 'nb-ext-toolbar';
      const headerContent = nativeHeader.querySelector('[class*="panel-header-content"]');
      if (headerContent) headerContent.insertAdjacentElement('afterend', toolbar);
      else nativeHeader.appendChild(toolbar);
    } else if (!nativeHeader && !toolbar) {
      console.log("[NB-Ext] ToolbarManager: No native header, attaching to container");
      toolbar = document.createElement('div');
      toolbar.className = 'nb-ext-toolbar';
      container.prepend(toolbar);
    }
    
    if (toolbar) {
      toolbar.textContent = ''; 
      this.renderButtons(manager, toolbar);
      this.refreshToolbarStatus(manager);
      console.log("[NB-Ext] ToolbarManager: initToolbar complete");
    } else {
      console.error("[NB-Ext] ToolbarManager: Failed to create/find toolbar");
    }
  },

  renderButtons(manager, toolbar) {
    // Search
    const searchBtn = this.createButton('search', 'Advanced Search', () => this.toggleSearchPanel(manager));
    if (manager.isSearchOpen) searchBtn.classList.add('active');

    // View Switch
    const viewBtn = this.createButton(manager.treeViewEnabled ? 'account_tree' : 'view_list', 'Toggle View', () => {
      manager.treeViewEnabled = !manager.treeViewEnabled;
      chrome.storage.local.set({ 'nb_ext_tree_enabled': manager.treeViewEnabled });
      manager.refreshData(true); // Force redraw
    });
    if (manager.treeViewEnabled) viewBtn.classList.add('active');

    // Single/Double Line Switch
    const modeBtn = this.createButton(manager.displayMode === 'single' ? 'view_headline' : 'view_agenda', 'Toggle Display Mode', () => {
      manager.displayMode = manager.displayMode === 'single' ? 'double' : 'single';
      chrome.storage.local.set({ 'nb_ext_display_mode': manager.displayMode });
      manager.refreshData(true); // Force redraw
    });

    // Create Folder
    const addDirBtn = this.createButton('create_new_folder', 'Create Folder', () => {
      UIRenderer.renderFolderCreator(manager);
    });

    toolbar.append(searchBtn, viewBtn, modeBtn, addDirBtn);

    // Licensing
    if (manager.licenseInfo && !manager.licenseInfo.isLicensed) {
      toolbar.appendChild(this.createButton('vpn_key', 'Activate License', () => UIRenderer.renderPaywall(manager, true)));
    }
  },

  createButton(iconName, title, onClick) {
    const btn = document.createElement('div');
    btn.className = 'nb-ext-toolbar-icon';
    btn.title = title;
    const span = document.createElement('span');
    span.className = 'material-symbols-outlined';
    span.textContent = iconName;
    btn.appendChild(span);
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  },

  toggleSearchPanel(manager) {
    manager.isSearchOpen = !manager.isSearchOpen;
    console.log(`[NB-Ext] SearchPanel: status=${manager.isSearchOpen}`);
    let panel = document.getElementById('nb-ext-search-panel');
    
    if (manager.isSearchOpen) {
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'nb-ext-search-panel';
        panel.className = 'nb-ext-search-panel';
        document.body.appendChild(panel);
      }
      
      const sidebarContent = document.querySelector('[class*="source-panel"]') || document.querySelector('.source-panel-content');
      if (sidebarContent) {
        LayoutEngine.initSidebarObserver(manager, sidebarContent);
      }
      LayoutEngine.updateSearchPanelPosition(manager);
      
      panel.textContent = '';
      const box = document.createElement('div');
      box.className = 'nb-ext-search-box';

      const hintIcon = document.createElement('span');
      hintIcon.className = 'material-symbols-outlined search-hint-icon';
      hintIcon.textContent = 'search';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'nb-ext-search-input-float';
      input.placeholder = 'Search... (Space=OR, +=AND)';
      input.value = manager.searchQuery;

      const closeIcon = document.createElement('span');
      closeIcon.className = 'material-symbols-outlined search-close-icon';
      closeIcon.textContent = 'close';
      closeIcon.addEventListener('click', () => this.toggleSearchPanel(manager));

      box.append(hintIcon, input, closeIcon);

      const help = document.createElement('div');
      help.className = 'nb-ext-search-help';
      help.textContent = 'Example: "doc pdf + 2025" matches (doc OR pdf) AND 2025';

      panel.append(box, help);
      
      const inputEl = panel.querySelector('input');
      setTimeout(() => inputEl.focus(), 50);
      
      inputEl.addEventListener('compositionstart', () => manager.isComposing = true);
      inputEl.addEventListener('compositionend', (e) => { 
        manager.isComposing = false; 
        manager.searchQuery = e.target.value; 
        UIRenderer.applyFilter(manager); 
      });
      inputEl.addEventListener('input', (e) => { 
        if (!manager.isComposing) { 
          manager.searchQuery = e.target.value; 
          UIRenderer.applyFilter(manager); 
        } 
      });
      inputEl.addEventListener('keydown', (e) => { 
        if (e.key === 'Escape') this.toggleSearchPanel(manager); 
      });
    } else {
      panel?.remove();
      if (manager.sidebarObserver) {
        manager.sidebarObserver.disconnect();
        manager.sidebarObserver = null;
      }
      manager.searchQuery = '';
      UIRenderer.applyFilter(manager);
    }
    this.refreshToolbarStatus(manager);
  },

  refreshToolbarStatus(manager) {
    const toolbar = document.querySelector('.nb-ext-toolbar');
    if (!toolbar) return;
    
    const icons = toolbar.querySelectorAll('.nb-ext-toolbar-icon');
    icons.forEach(icon => {
      const span = icon.querySelector('span');
      if (!span) return;
      
      if (span.textContent === 'search') {
        icon.classList.toggle('active', manager.isSearchOpen);
      }
    });

    const isShown = getComputedStyle(toolbar).display !== 'none';
    console.log(`[NB-Ext] Toolbar Status: visible=${isShown}`);
  }
};
