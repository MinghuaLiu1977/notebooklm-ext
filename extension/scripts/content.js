/**
 * NotebookLM Enhancer - Core Manager
 */
var NotebookManager = {
  notebookId: null,
  sources: [],
  notes: [],
  displayMode: 'single', 
  collapsedFolderIds: [], 
  searchQuery: '',
  isSearchOpen: false,
  isComposing: false,
  isAddingFolder: false,
  licenseInfo: null,
  isRendering: false,
  isInitialized: false,
  lastContainerFixTime: 0,
  scanTimer: null,
  sidebarObserver: null,

  async init() {
    if (this.isInitialized) return;

    // Check if extension context is valid
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      return;
    }

    // Check if extension is enabled
    const isEnabled = await StorageManager.getEnabledState();
    if (!isEnabled) {
      console.log("[NB-Ext] Extension is disabled. Skipping initialization.");
      return;
    }

    // 1. Storage Bridge: Listen for Popup requests
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getNotebookConfig') {
        StorageManager.getNotebookConfig(request.notebookId).then(sendResponse);
        return true; 
      }
      if (request.action === 'saveNotebookConfig') {
        StorageManager.saveNotebookConfig(request.notebookId, request.config);
        sendResponse({ success: true });
      }
    });

    // 2. Data Migration: One-time migration
    try {
      const migrationFlag = `nb_ext_migrated_${chrome.runtime.id}`;
      if (!localStorage.getItem(migrationFlag)) {
        console.log("[NB-Ext] Starting data migration to localStorage...");
        const localData = await chrome.storage.local.get(null);
        for (const key in localData) {
          if (key.startsWith('notebook_config_')) {
            localStorage.setItem(key, JSON.stringify(localData[key]));
          }
        }
        localStorage.setItem(migrationFlag, 'true');
      }
    } catch (e) {}

    // 3. Global Styles
    if (!document.getElementById('nb-ext-material-icons')) {
      const link = document.createElement('link');
      link.id = 'nb-ext-material-icons';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0';
      document.head.appendChild(link);
    }

    document.body.classList.add('nb-ext-deep-mode');

    // 4. Lifecycle monitoring
    this.observer = new MutationObserver(() => {
      if (this.scanTimer) clearTimeout(this.scanTimer);
      this.scanTimer = setTimeout(() => this.scanDom(), 500);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });

    // 5. Shared background sync
    setInterval(() => {
      if (this.notebookId) {
        LayoutEngine.syncContainerSize(this);
        ToolbarManager.updatePosition(this);
      }
    }, 1000);

    // 6. Global click capture
    document.addEventListener('click', (e) => {
      if (!this.notebookId) return;
      const header = e.target.closest('.source-panel-header') || e.target.closest('[role="row"]');
      if (header && (e.target.closest('mat-checkbox') || e.target.closest('input[type="checkbox"]'))) {
        this.scheduleRefresh([100, 300, 1000]);
      }
      setTimeout(() => ToolbarManager.updatePosition(this), 50);
    }, true);

    this.isInitialized = true;
    console.log("[NB-Ext] Global services initialized.");

    // 7. Initial Notebook detection
    this.notebookId = StorageManager.extractNotebookId();
    if (this.notebookId) {
      // Safety check to prevent context invalidation leading to undefined chrome.storage.local
      let settings = { nb_ext_tree_enabled: true, nb_ext_display_mode: 'single', nb_ext_collapsed_ids: [] };
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        settings = await chrome.storage.local.get(['nb_ext_tree_enabled', 'nb_ext_display_mode', 'nb_ext_collapsed_ids']);
      }
      this.treeViewEnabled = settings.nb_ext_tree_enabled ?? true;
      this.displayMode = settings.nb_ext_display_mode ?? 'single';
      this.collapsedFolderIds = settings.nb_ext_collapsed_ids ?? [];
      
      this.refreshData();
    }
  },

  async handleNotebookSwitch(newId) {
    if (!newId || newId === this.notebookId) return;
    
    console.log(`[NB-Ext] Switching context to: ${newId}`);
    this.notebookId = newId;
    this.sources = [];
    this.notes = [];
    
    if (!this.isInitialized) {
      await this.init();
    } else {
      // Clear current UI state to prevent flicker or residue
      const container = document.getElementById('nb-ext-container');
      if (container) container.textContent = '';
      this.refreshData(true);
    }
  },

  async checkLicense() {
    this.licenseInfo = await StorageManager.getLicenseInfo();
    const trialPeriod = this.licenseInfo.trialDays * 86400000;
    this.licenseInfo.isExpired = !this.licenseInfo.isLicensed && (Date.now() - this.licenseInfo.installDate > trialPeriod);
    return this.licenseInfo;
  },

  async refreshData(force = false) {
    try {
      await this.checkLicense();
      const needsRender = this.scanDom(force);
      if (needsRender || force) {
        UIRenderer.renderSidebarUI(this);
      }
    } catch (e) {
      console.error("[NB-Ext] Refresh failure:", e);
    }
  },

  // Multi-stage refresh to ensure native asynchronous operations are eventually captured
  scheduleRefresh(delays = [100, 300, 600]) {
    delays.forEach(ms => {
      setTimeout(() => this.refreshData(true), ms);
    });
  },

  scanDom() {
    const scrollArea = document.querySelector('.scroll-area-desktop') || document.querySelector('.mat-drawer-inner-container');
    const container = document.getElementById('nb-ext-container');

    const forceRender = !container || !document.contains(container) || (container.style.display === 'none' && scrollArea?.offsetWidth >= 150);

    if (!scrollArea) {
      // LayoutEngine.syncContainerSize(this); // Moved to init()
      return;
    }

    // Scraper logic
    const sourceElements = scrollArea.querySelectorAll('.source-stretched-button, button[class*="stretched-button"]');
    
    // Locate native "Select all" button (precision targeting via aria-label)
    let nativeSelectAll = document.querySelector('input[aria-label="Select all sources"]');
    
    // Compatibility fallback
    if (!nativeSelectAll) {
      nativeSelectAll = document.querySelector('.source-panel-header input[type="checkbox"]');
    }

    if (nativeSelectAll && !nativeSelectAll.getAttribute('data-nb-ext-watched')) {
      nativeSelectAll.setAttribute('data-nb-ext-watched', 'true');
      
      const nativeContainer = nativeSelectAll.closest('.mat-mdc-checkbox') || nativeSelectAll.parentElement;
      const headerArea = nativeSelectAll.closest('.source-panel-header') || nativeSelectAll.closest('[role="row"]') || nativeContainer;

      // 1. Area click listener - capture even if Angular intercepts checkbox changes
      if (headerArea) {
        headerArea.addEventListener('click', () => {
          console.log("[NB-Ext] Native Header Area clicked, scheduling multi-stage refresh...");
          this.scheduleRefresh([100, 300, 1000]); 
        }, true);
      }

      // 2. Native change listener
      nativeSelectAll.addEventListener('change', () => {
        console.log("[NB-Ext] Native Select All changed, scheduling refresh...");
        this.scheduleRefresh([100, 500]);
      });

      // 3. Deep monitoring of native status changes
      if (this.nativeObserver) this.nativeObserver.disconnect();
      this.nativeObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && (mutation.attributeName === 'class' || mutation.attributeName === 'aria-checked')) {
            console.log("[NB-Ext] Native Checkbox attributes changed, refreshing...");
            this.refreshData(true);
            break;
          }
        }
      });
      
      this.nativeObserver.observe(nativeSelectAll, { attributes: true });
      if (nativeContainer) this.nativeObserver.observe(nativeContainer, { attributes: true });
    }
    this.nativeSelectAll = nativeSelectAll;

    const newSources = Array.from(sourceElements).map(el => {
      const parent = el.closest('.mat-mdc-list-item') || el.parentElement;
      const moreBtn = parent.querySelector('[id^="source-item-more-button-"]');
      const name = el.getAttribute('aria-label') || el.innerText || "Unknown";
      
      // Detect loading state (spinner or indeterminate state)
      const hasSpinner = !!parent.querySelector('mat-progress-spinner, .mat-mdc-progress-spinner, [role="progressbar"]');
      
      return { 
        id: moreBtn ? moreBtn.id.replace('source-item-more-button-', '') : `auto-${name.replace(/\s+/g, '')}`,
        name, 
        element: el, 
        checkbox: parent.querySelector('input[type="checkbox"]'),
        isLoading: hasSpinner
      };
    });

    const hasChanged = JSON.stringify(newSources.map(s => ({ id: s.id, name: s.name, checked: !!s.checkbox?.checked, isLoading: s.isLoading }))) !== 
                      JSON.stringify(this.sources.map(s => ({ id: s.id, name: s.name, checked: !!s.checkbox?.checked, isLoading: s.isLoading })));

    if (hasChanged || forceRender) {
      if (this.isRendering && !forceRender) return false;
      
      // Rate limit for forceRender to avoid overkill, but don't stall completely
      if (!hasChanged && forceRender && Date.now() - this.lastContainerFixTime < 500) return false;
      
      this.lastContainerFixTime = Date.now();
      this.sources = newSources;
      return true; // Inform caller that redraw is needed
    }
    return false;
  },

  async addFolderWithName(name) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    config.folders.push({ id: Date.now().toString(), name, itemIds: [] });
    await StorageManager.saveNotebookConfig(this.notebookId, config);
    this.refreshData(true);
  },

  async renameFolder(folderId, newName) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    const folder = config.folders.find(f => f.id === folderId);
    if (folder && newName) {
      folder.name = newName;
      await StorageManager.saveNotebookConfig(this.notebookId, config);
    }
    this.refreshData(true);
  },

  async removeFolderOnly(folderId) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    config.folders = config.folders.filter(f => f.id !== folderId);
    await StorageManager.saveNotebookConfig(this.notebookId, config);
    this.refreshData(true);
  },

  async moveItemToFolder(itemId, folderId) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    config.folders.forEach(f => f.itemIds = f.itemIds.filter(id => id !== itemId));
    if (folderId) {
      const folder = config.folders.find(f => f.id === folderId);
      if (folder) folder.itemIds.push(itemId);
    }
    await StorageManager.saveNotebookConfig(this.notebookId, config);
    this.refreshData(true);
  },

  async toggleGlobalSelection(isChecked) {
    console.log(`[NB-Ext] toggleGlobalSelection: ${isChecked}`);
    this.sources.forEach(item => {
      if (item.checkbox && item.checkbox.checked !== isChecked) {
        item.checkbox.click();
      }
    });
    this.scheduleRefresh([100, 500]);
  },

  async toggleFolderSelection(folderId) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    const folder = config.folders.find(f => f.id === folderId);
    if (!folder) return;
    
    // Only operate on items that are currently present in the DOM/scan
    const activeItems = folder.itemIds.map(itemId => [...this.sources, ...this.notes].find(i => i.id === itemId)).filter(Boolean);
    if (activeItems.length === 0) return;

    const state = this.getSelectionState(folder.itemIds);
    const targetChecked = state === 'all' ? false : true;

    activeItems.forEach(item => {
      if (item.checkbox && item.checkbox.checked !== targetChecked) {
        item.checkbox.click();
      }
    });
    this.scheduleRefresh([100, 500]);
  },

  getSelectionState(itemIds) {
    if (!itemIds || itemIds.length === 0) return 'none';
    
    const pool = [...this.sources, ...this.notes];
    const activeItems = itemIds.map(id => pool.find(s => s.id === id)).filter(Boolean);
    
    if (activeItems.length === 0) return 'none';
    
    const checkedCount = activeItems.filter(i => i.checkbox?.checked).length;

    if (checkedCount === 0) return 'none';
    if (checkedCount === activeItems.length) return 'all';
    return 'partial';
  },

  getGlobalSelectionState() {
    return this.getSelectionState(this.sources.map(s => s.id));
  },

  async verifyLicense(key) {
    const params = new URLSearchParams({ product_id: '9KnEA4Z1DE6BlSSJRqONvg==', license_key: key });
    try {
      const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const data = await response.json();
      if (data.success && !data.uses_limit_reached) {
        await StorageManager.setLicense(key, true);
        return true;
      }
    } catch {}
    return false;
  }
};

// URL Monitoring: Detect notebook context change without full reload
let lastUrlNotebookId = StorageManager.extractNotebookId();
setInterval(() => {
  const currentId = StorageManager.extractNotebookId();
  if (currentId && currentId !== lastUrlNotebookId) {
    NotebookManager.handleNotebookSwitch(currentId);
  }
  lastUrlNotebookId = currentId;
}, 1000);

setTimeout(() => NotebookManager.init(), 2000);
