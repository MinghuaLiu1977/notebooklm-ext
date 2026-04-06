/**
 * NotebookLM Enhancer - Core Manager
 */
var NotebookManager = {
  notebookId: null,
  sources: [],
  notes: [],
  displayMode: 'single', 
  treeViewEnabled: true,
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

    this.notebookId = StorageManager.extractNotebookId();
    if (this.notebookId) {
      // 1. Loading Settings FIRST
      this.treeViewEnabled = await StorageManager.getTreeViewEnabled();
      this.displayMode = await StorageManager.getDisplayMode();
      this.collapsedFolderIds = await StorageManager.getCollapsedFolderIds();
      
      console.log("[NB-Ext] Settings loaded:", { 
        view: this.treeViewEnabled, 
        mode: this.displayMode 
      });
    }

    // 2. Global Styles
    if (!document.getElementById('nb-ext-material-icons')) {
      const link = document.createElement('link');
      link.id = 'nb-ext-material-icons';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0';
      document.head.appendChild(link);
    }

    document.body.classList.add('nb-ext-deep-mode');

    // 3. Lifecycle monitoring
    this.observer = new MutationObserver(() => {
      if (this.scanTimer) clearTimeout(this.scanTimer);
      this.scanTimer = setTimeout(() => this.refreshData(), 500);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });

    // 4. Shared background sync
    setInterval(() => {
      if (this.notebookId) {
        LayoutEngine.syncContainerSize(this);
        ToolbarManager.updatePosition(this);
      }
    }, 1000);

    // 5. Global click capture
    document.addEventListener('click', (e) => {
      if (!this.notebookId) return;
      const header = e.target.closest('.source-panel-header') || e.target.closest('[role="row"]');
      if (header && (e.target.closest('mat-checkbox') || e.target.closest('input[type="checkbox"]'))) {
        this.scheduleRefresh([100, 300, 1000]);
      }
      setTimeout(() => ToolbarManager.updatePosition(this), 50);
    }, true);

    this.isInitialized = true;
    console.log("[NB-Ext] Persistence: Initialized with settings:", { 
      treeView: this.treeViewEnabled, 
      display: this.displayMode,
      toolbarEnabled: ToolbarManager.isToolbarEnabled,
      toolbarExpanded: ToolbarManager.isToolbarExpanded
    });

    this.watchForArtifacts();

    if (this.notebookId) {
      this.refreshData(true);
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
    this.licenseInfo.isExpired = false;
    return this.licenseInfo;
  },

  updatePromoPosition(container, promoBtn) {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      promoBtn.style.opacity = '0';
      promoBtn.style.pointerEvents = 'none';
      return;
    }
    
    // Check if container is actually visible in viewport
    const isVisible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    if (!isVisible) {
      promoBtn.style.opacity = '0';
      promoBtn.style.pointerEvents = 'none';
      return;
    }

    promoBtn.style.opacity = '1';
    promoBtn.style.pointerEvents = 'auto';
    
    const centerX = rect.left + rect.width / 2;
    const threshold = 50; 
    
    // If container top is near viewport top, place inside (10px from top)
    // Otherwise place above (40px above its top)
    if (rect.top < threshold) {
      promoBtn.style.top = Math.max(10, rect.top + 10) + 'px';
    } else {
      promoBtn.style.top = (rect.top - 40) + 'px';
    }
    
    promoBtn.style.left = centerX + 'px';
  },

  watchForArtifacts() {
    if (this.artifactObserver) return;
    
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 || navigator.userAgent.includes('Mac OS');
    if (!isMac) return;

    this.artifactObserver = new MutationObserver(() => {
      // Prioritize the main viewer container and actual slide/artifact viewers.
      // Avoid generic selectors like 'studio' or 'player' that match sidebar components.
      const allPossible = document.querySelectorAll('.artifact-viewer-container, lb-slide-deck, lb-artifact-viewer, lb-document-viewer');
      if (!allPossible.length) return;

      // Deduplicate: If multiple containers are nested, only track the specific ones mentioned by user or the innermost ones.
      const artifactContainers = Array.from(allPossible).filter(container => {
        // If this container is inside another potential container, it might be a duplicate trigger.
        // HOWEVER, we want to prioritize '.artifact-viewer-container' if it's the one the user cares about.
        const isPriority = container.classList.contains('artifact-viewer-container');
        const parentContainer = container.parentElement?.closest('.artifact-viewer-container, lb-slide-deck, lb-artifact-viewer, lb-document-viewer, [class*="slide-deck"], [class*="artifact"]');
        
        // If we have a parent container and we are NOT the priority one, skip us (let the parent handle it).
        // If we ARE the priority one, we take precedence (but we should still check if another priority is above us).
        if (parentContainer && !isPriority) return false;
        
        return true;
      });

      artifactContainers.forEach(container => {
        if (container.dataset.sliderevTracked) return;
        
        // Final check: does any parent or child already have a tracked status?
        if (container.closest('[data-sliderev-tracked]')) return;
        if (container.querySelector('[data-sliderev-tracked]')) return;

        container.dataset.sliderevTracked = 'true';
        
        // Skip if too small
        if (container.offsetWidth < 100 || container.offsetHeight < 100) return;

        const promoBtn = document.createElement('div');
        promoBtn.className = 'sliderev-promo-tooltip';
        promoBtn.innerHTML = `
          <span class="material-symbols-outlined promo-icon">auto_awesome</span>
          <span class="promo-text">Want an editable edition?</span>
        `;
        
        let clickedOnce = false;
        promoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!clickedOnce) {
            clickedOnce = true;
            promoBtn.innerHTML = `
              <span class="material-symbols-outlined promo-icon">download</span>
              <span class="promo-text">Get SlideRev for macOS</span>
            `;
            promoBtn.classList.add('sliderev-promo-second-state');
            setTimeout(() => {
              if (clickedOnce) {
                clickedOnce = false;
                promoBtn.innerHTML = `
                  <span class="material-symbols-outlined promo-icon">auto_awesome</span>
                  <span class="promo-text">Want an editable edition?</span>
                `;
                promoBtn.classList.remove('sliderev-promo-second-state');
              }
            }, 5000);
          } else {
            window.open(chrome.runtime.getURL('sliderev.html'), '_blank');
            clickedOnce = false;
            promoBtn.innerHTML = `
              <span class="material-symbols-outlined promo-icon">auto_awesome</span>
              <span class="promo-text">Want an editable edition?</span>
            `;
            promoBtn.classList.remove('sliderev-promo-second-state');
          }
        });
        
        document.body.appendChild(promoBtn);

        // Keep position synced
        const update = () => this.updatePromoPosition(container, promoBtn);
        
        // Initial position
        update();
        
        // Sync on resize/scroll/changes
        const ro = new ResizeObserver(update);
        ro.observe(container);
        
        // We also need to handle scrolling of any parent container
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        
        // Use a small interval as fallback for dynamic layout shifts not caught by ResizeObserver
        const interval = setInterval(() => {
           if (!container.isConnected) {
             promoBtn.remove();
             ro.disconnect();
             window.removeEventListener('scroll', update, true);
             window.removeEventListener('resize', update);
             clearInterval(interval);
             return;
           }
           update();
        }, 500);
      });
    });
    
    this.artifactObserver.observe(document.body, { childList: true, subtree: true });
  },

  async refreshData(force = false) {
    if (!this.isInitialized && !force) return;
    
    // Support both direct variable and window property for flexibility
    const renderer = typeof UIRenderer !== 'undefined' ? UIRenderer : window.UIRenderer;
    if (!renderer) {
        if (force) console.warn("[NB-Ext] UIRenderer not loaded yet. Skipping refresh.");
        return;
    }

    try {
      await this.checkLicense();
      const needsRender = this.scanDom(force);
      if (needsRender || force) {
        renderer.renderSidebarUI(this);
      }
    } catch (e) {
      console.error("[NB-Ext] Refresh failure:", e.message, e.stack);
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
      if (!parent) return null;

      const moreBtn = parent.querySelector('[id^="source-item-more-button-"]');
      const name = (el.getAttribute('aria-label') || el.textContent || "Unknown").toString().trim();
      
      // Detect loading state (spinner or indeterminate state)
      const hasSpinner = !!parent.querySelector('mat-progress-spinner, .mat-mdc-progress-spinner, [role="progressbar"]');
      
      // Detect unavailable/error state
      // 1. Explicit error icons natively injected by NotebookLM
      const errorIcons = parent.querySelectorAll('mat-icon, .material-symbols-outlined');
      const hasErrorIcon = Array.from(errorIcons).some(i => {
        const text = (i.textContent || "").toLowerCase();
        return text === 'error' || text === 'warning' || text === 'error_outline' || i.classList.contains('text-error');
      });
      
      // 2. Disabled states
      const parentIsDisabled = parent.hasAttribute('disabled') || 
                               parent.getAttribute('aria-disabled') === 'true' || 
                               parent.classList.contains('disabled') ||
                               parent.classList.contains('mat-mdc-list-item-disabled');
                               
      const isDisabledDescendant = !!parent.querySelector('input[type="checkbox"]:disabled, button:disabled, [aria-disabled="true"]');
      
      // 3. User-identified explicit error block inside the source container
      const hasErrorContainer = parent.classList.contains('single-source-error-container') || 
                                !!parent.querySelector('.single-source-error-container');
      
      const isUnavailable = hasErrorIcon || parentIsDisabled || isDisabledDescendant || hasErrorContainer;
      
      return { 
        id: moreBtn ? moreBtn.id.replace('source-item-more-button-', '') : `auto-${name.replace(/\s+/g, '')}`,
        name, 
        element: el, 
        checkbox: parent.querySelector('input[type="checkbox"]'),
        isLoading: hasSpinner,
        isUnavailable: isUnavailable
      };
    }).filter(Boolean); // Filter out null parents

    // Log newly discovered unavailable sources
    newSources.forEach(s => {
      if (s.isUnavailable) {
        const old = this.sources.find(x => x.id === s.id);
        if (!old || !old.isUnavailable) {
          console.log(`[NB-Ext] 🚫 Source marked as unavailable: "${s.name}" (ID: ${s.id})`);
        }
      }
    });

    const hasChanged = JSON.stringify(newSources.map(s => ({ id: s.id, name: s.name, checked: !!s.checkbox?.checked, isLoading: s.isLoading, isUnavailable: s.isUnavailable }))) !== 
                      JSON.stringify(this.sources.map(s => ({ id: s.id, name: s.name, checked: !!s.checkbox?.checked, isLoading: s.isLoading, isUnavailable: s.isUnavailable })));

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

// Start immediate monitoring
NotebookManager.init();
