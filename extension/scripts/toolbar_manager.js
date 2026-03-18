var ToolbarManager = {
  isToolbarEnabled: true,
  isToolbarExpanded: true,
  isSourcePanelVisible: false,

  async initToolbar(manager) {
    console.log("[NB-Ext] ToolbarManager: initToolbar started");
    this.isToolbarEnabled = await StorageManager.getToolbarEnabled();
    this.isToolbarExpanded = await StorageManager.getToolbarExpanded();
    
    const shell = this.getOrCreateShell();
    let toolbar = shell.querySelector('.nb-ext-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'nb-ext-toolbar';
      shell.appendChild(toolbar);
    }

    this.updatePosition(manager);
    this.renderButtons(manager, toolbar);
    this.refreshToolbarStatus(manager);
  },

  getOrCreateShell() {
    let shell = document.querySelector('.nb-ext-floating-shell');
    if (!shell) {
      shell = document.createElement('div');
      shell.className = 'nb-ext-floating-shell';
      document.body.appendChild(shell);
    }
    return shell;
  },

  updatePosition(manager) {
    const toolbar = document.querySelector('.nb-ext-toolbar');
    const sourcePanel = document.querySelector('[class*="source-panel"]') || document.querySelector('.source-panel-content');
    
    if (!toolbar) return;

    // Strict detection using ViewDetector
    const isMainList = ViewDetector.isMainListView();
    const isCollapsed = ViewDetector.isNativeCollapsed();
    const oldVisible = this.isSourcePanelVisible;
    this.isSourcePanelVisible = !!(sourcePanel && isMainList && !isCollapsed);

    if (this.isSourcePanelVisible && !oldVisible && toolbar) {
      this.renderButtons(manager, toolbar);
    }

    if (this.isSourcePanelVisible) {
      toolbar.style.display = 'flex';
      const shell = document.querySelector('.nb-ext-floating-shell');
      if (shell) {
        shell.style.visibility = 'visible';
        shell.classList.remove('nb-ext-shell-collapsed');
      }
    } else {
      toolbar.style.display = 'flex'; 
      const shell = document.querySelector('.nb-ext-floating-shell');
      if (shell) {
        shell.style.visibility = 'hidden'; // Hide the entire container
        shell.classList.add('nb-ext-shell-collapsed');
      }
    }
    
    this.refreshToolbarStatus(manager);
  },

  renderButtons(manager, toolbar) {
    toolbar.textContent = '';

    const isMini = !this.isSourcePanelVisible || !this.isToolbarEnabled || !this.isToolbarExpanded;

    if (isMini) {
      // Mini Mode: Single Icon based on situation
      let iconName = 'extension';
      let tooltip = '展开工具栏 (Expand)';
      let onClick = () => this.toggleExpanded(manager);

      const isNotebook = window.location.href.includes('/notebook/');

      if (!this.isSourcePanelVisible) {
        // If panel strictly HIDDEN or strictly COLLAPSED, show refresh only if detection failed
        // User wants "Folded" icon at start instead of refresh
        iconName = 'refresh';
        tooltip = '备用 (源面板已收缩/隐藏)';
        onClick = () => manager.refreshData(true);

        // If we're in a notebook, don't show refresh at start if it's the first render
        if (isNotebook && !this.isToolbarEnabled) {
          iconName = 'play_arrow';
          tooltip = '启用功能 (Enable)';
          onClick = () => this.toggleEnabled(manager);
        } else if (isNotebook && !this.isToolbarExpanded) {
          iconName = 'extension';
          tooltip = '展开工具栏 (Expand)';
          onClick = () => this.toggleExpanded(manager);
        } else if (isNotebook) {
          // If in notebook and supposedly expanded but panel missing, 
          // show play_arrow (Standby) instead of "Folded" icon
          iconName = 'play_arrow';
          tooltip = '待机 (等待面板加载...)';
          onClick = () => manager.refreshData(true);
        }
      } else if (!this.isToolbarEnabled) {
        iconName = 'play_arrow';
        tooltip = '启用功能 (Enable)';
        onClick = () => this.toggleEnabled(manager);
      }

      const toggleBtn = this.createButton(iconName, tooltip, onClick);
      toggleBtn.classList.add('nb-ext-toggle-btn');
      toolbar.appendChild(toggleBtn);
    } else {
      // ... (Rest of Full Mode remains the same)
      const searchBtn = this.createButton('search', '高级搜索 (Search)', () => this.toggleSearchPanel(manager));
      if (manager.isSearchOpen) searchBtn.classList.add('active');

      const viewBtn = this.createButton(manager.treeViewEnabled ? 'account_tree' : 'view_list', '切换视图 (View)', () => {
        manager.treeViewEnabled = !manager.treeViewEnabled;
        chrome.storage.local.set({ 'nb_ext_tree_enabled': manager.treeViewEnabled });
        manager.refreshData(true);
      });
      if (manager.treeViewEnabled) viewBtn.classList.add('active');

      const modeBtn = this.createButton(manager.displayMode === 'single' ? 'view_headline' : 'view_agenda', '显示模式 (Mode)', () => {
        manager.displayMode = manager.displayMode === 'single' ? 'double' : 'single';
        chrome.storage.local.set({ 'nb_ext_display_mode': manager.displayMode });
        manager.refreshData(true);
      });

      const addDirBtn = this.createButton('create_new_folder', '新建文件夹 (New Folder)', () => {
        UIRenderer.renderFolderCreator(manager);
      });

      toolbar.append(searchBtn, viewBtn, modeBtn, addDirBtn);

      if (manager.licenseInfo && !manager.licenseInfo.isLicensed) {
        toolbar.appendChild(this.createButton('vpn_key', '激活 (Activate)', () => UIRenderer.renderPaywall(manager, true)));
      }

      const spacer = document.createElement('div');
      spacer.style.width = '4px';
      toolbar.appendChild(spacer);

      const disableBtn = this.createButton('power_settings_new', '进入备用状态 (Standby)', () => this.toggleEnabled(manager));
      disableBtn.style.color = '#d93025'; 
      
      const foldBtn = this.createButton('chevron_left', '收起 (Fold)', () => this.toggleExpanded(manager));

      toolbar.append(disableBtn, foldBtn);
    }
  },

  async toggleEnabled(manager) {
    if (!this.isToolbarEnabled) {
      // Trying to ENABLE: Strict check
      if (ViewDetector.isNativeCollapsed() || !ViewDetector.isMainListView()) {
        console.log("[NB-Ext] Cannot enable: Source panel is collapsed or hidden.");
        manager.refreshData(true); // Rescan instead
        return;
      }
    }

    this.isToolbarEnabled = !this.isToolbarEnabled;
    await StorageManager.setToolbarEnabled(this.isToolbarEnabled);
    if (this.isToolbarEnabled) {
        this.isToolbarExpanded = true; // Auto expand when re-enabling
        await StorageManager.setToolbarExpanded(true);
    }
    manager.refreshData(true);
    this.renderButtons(manager, document.querySelector('.nb-ext-toolbar'));
    this.refreshToolbarStatus(manager);
  },

  async toggleExpanded(manager) {
    this.isToolbarExpanded = !this.isToolbarExpanded;
    await StorageManager.setToolbarExpanded(this.isToolbarExpanded);
    this.renderButtons(manager, document.querySelector('.nb-ext-toolbar'));
    this.refreshToolbarStatus(manager);
  },

  createButton(iconName, title, onClick) {
    const btn = document.createElement('div');
    btn.className = 'nb-ext-toolbar-icon';
    btn.title = title;
    const span = document.createElement('span');
    span.className = 'material-symbols-outlined';
    span.textContent = iconName;
    btn.appendChild(span);
    btn.addEventListener('click', (e) => { 
      e.stopPropagation(); 
      onClick(); 
    });
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
        this.getOrCreateShell().appendChild(panel);
      }
      
      const sidebarContent = document.querySelector('[class*="source-panel"]') || document.querySelector('.source-panel-content');
      if (sidebarContent) {
        LayoutEngine.initSidebarObserver(manager, sidebarContent);
      }
      
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
      setTimeout(() => {
        if (inputEl) {
          inputEl.focus();
          console.log("[NB-Ext] Search input focused");
        }
      }, 100);
      
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
    
    const isMini = !this.isSourcePanelVisible || !this.isToolbarEnabled || !this.isToolbarExpanded;
    toolbar.classList.toggle('nb-ext-toolbar-disabled', isMini);
    
    const icons = toolbar.querySelectorAll('.nb-ext-toolbar-icon');
    icons.forEach(icon => {
      const span = icon.querySelector('span');
      if (!span) return;
      
      if (span.textContent === 'search') {
        icon.classList.toggle('active', manager.isSearchOpen);
      }
    });

    console.log(`[NB-Ext] Toolbar Status: mini=${isMini}, panelVisible=${this.isSourcePanelVisible}`);
  }
};
