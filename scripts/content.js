console.log("NotebookLM Directory Manager Loaded");

const NotebookManager = {
  notebookId: null,
  sources: [],
  notes: [],
  displayMode: 'single', 
  collapsedFolderIds: [], 
  searchQuery: '', // 4.12: 搜索内容
  sortBy: 'time',  // 4.12: 'time' | 'name'
  sortOrder: 'asc',
  isDeepMode: true, // 4.23: 默认开启深度集成以支持隐藏原生列表
  editingFolderId: null, // 4.35: 正在编辑名称的文件夹 ID
  isSearchOpen: false, // 4.60: 搜索面板显示状态
  isComposing: false, // 4.61: IME 输入状态
  sidebarObserver: null, // 4.62: 监听侧边栏尺寸
  currentSidebarWidth: 0, // 4.62: 宽缓存
  currentSidebarLeft: 0,  // 4.62: 偏移缓存

  async init() {
    this.notebookId = StorageManager.extractNotebookId();
    if (!this.notebookId) return;

    // 4.2: 注入 Material Symbols 字体
    if (!document.getElementById('nb-ext-material-icons')) {
      const link = document.createElement('link');
      link.id = 'nb-ext-material-icons';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0';
      document.head.appendChild(link);
    }

    // 加载用户持久化设置
    const settings = await chrome.storage.local.get(['nb_ext_tree_enabled', 'nb_ext_display_mode', 'nb_ext_collapsed_ids']);
    if (settings.nb_ext_tree_enabled !== undefined) this.treeViewEnabled = settings.nb_ext_tree_enabled;
    if (settings.nb_ext_display_mode !== undefined) this.displayMode = settings.nb_ext_display_mode;
    if (settings.nb_ext_collapsed_ids !== undefined) this.collapsedFolderIds = settings.nb_ext_collapsed_ids;

    console.log("NotebookID identified:", this.notebookId);
    
    // 给 body 加上标记位
    if (this.isDeepMode) document.body.classList.add('nb-ext-deep-mode');

    // 监听 URL 变化
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        this.notebookId = StorageManager.extractNotebookId();
        this.refreshData();
      }
    }, 2000);

    this.observer = new MutationObserver(() => this.scanDom());
    this.observer.observe(document.body, { childList: true, subtree: true });
    
    // 4.20/4.21: 基于 ResizeObserver 精准监听侧边栏物理宽度
    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.borderBoxSize ? entry.borderBoxSize[0].inlineSize : entry.contentRect.width;
        
        // 4.21: 强制 Inline Style 控制，防止 Angular 官方高权重样式覆盖
        const toolbar = document.querySelector('.nb-ext-toolbar');
        const searchInput = document.querySelector('.nb-ext-search-container');
        
        if (width < 150) {
          document.body.classList.add('nb-ext-is-collapsed');
          if (toolbar) toolbar.style.setProperty('display', 'none', 'important');
          if (searchInput) searchInput.style.setProperty('display', 'none', 'important');
        } else {
          document.body.classList.remove('nb-ext-is-collapsed');
          if (toolbar) toolbar.style.removeProperty('display');
          if (searchInput) searchInput.style.removeProperty('display');
        }
      }
    });

    this.refreshData();
  },

  async refreshData() {
    this.scanDom();
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    this.renderSidebarUI(config);
  },

  scanDom() {
    // 捕获 Sources，同时捕获其对应的原生 Checkbox
    const sourceElements = document.querySelectorAll('.source-stretched-button');
    const newSources = Array.from(sourceElements).map(el => {
      const parent = el.closest('.mat-mdc-list-item') || el.parentElement;
      const checkbox = parent.querySelector('input.mdc-checkbox__native-control');
      const moreBtn = parent.querySelector('[id^="source-item-more-button-"]');
      const id = moreBtn ? moreBtn.id.replace('source-item-more-button-', '') : null;
      const name = el.getAttribute('aria-label') || el.innerText;
      return { id, name, element: el, checkbox: checkbox };
    }).filter(s => s.id);

    // 捕获 Notes
    const noteElements = document.querySelectorAll('.artifact-stretched-button');
    const newNotes = Array.from(noteElements).map(el => {
      const parent = el.closest('.mat-mdc-list-item') || el.parentElement;
      const checkbox = parent.querySelector('input.mdc-checkbox__native-control');
      const moreBtn = parent.querySelector('[id^="artifact-more-button-"]');
      const id = moreBtn ? moreBtn.id.replace('artifact-more-button-', '') : null;
      const name = el.getAttribute('aria-label') || el.innerText;
      return { id, name, element: el, checkbox: checkbox };
    }).filter(n => n.id);

    if (JSON.stringify(newSources.map(s => s.id)) !== JSON.stringify(this.sources.map(s => s.id)) ||
        JSON.stringify(newNotes.map(n => n.id)) !== JSON.stringify(this.notes.map(n => n.id))) {
      this.sources = newSources;
      this.notes = newNotes;
      
      // 4.28: 为原生 Checkbox 绑定状态回流监听（解决点击单项后 UI 不更新问题）
      this.sources.concat(this.notes).forEach(item => {
        if (item.checkbox && !item.checkbox.hasNbExtListener) {
          item.checkbox.hasNbExtListener = true;
          item.checkbox.addEventListener('change', () => {
             console.log("[NB-Ext] Native checkbox changed, syncing...");
             StorageManager.getNotebookConfig(this.notebookId).then(config => this.renderSidebarUI(config));
          });
        }
      });

      console.log(`Deep Refresh: ${this.sources.length} sources detected.`);
      this.refreshData();
    }

    // 4.38: 核心优化：全选状态双向同步联动
    const sidebarContent = document.querySelector('.source-panel-content');
    if (sidebarContent) {
      const selectAllContainer = sidebarContent.querySelector('.select-all-sources-container') || 
                                 sidebarContent.querySelector('.select-checkbox-all-sources-container');
      if (selectAllContainer) {
        // 4.69: 拦截全选容器点击，实现基于过滤状态的按需多选
        if (!selectAllContainer.hasNbExtClickListener) {
          selectAllContainer.hasNbExtClickListener = true;
          selectAllContainer.addEventListener('click', (e) => {
            if (this.searchQuery && this.searchQuery.trim() !== '') {
              e.preventDefault();
              e.stopPropagation();
              
              const visibleItems = Array.from(document.querySelectorAll('.nb-ext-item, .nb-ext-item-row'))
                .filter(el => !el.classList.contains('nb-ext-hidden'));
                
              if (visibleItems.length === 0) return;

              const isAllVisibleSelected = visibleItems.every(el => {
                 const cb = el.querySelector('.nb-ext-checkbox-native');
                 return cb && cb.textContent === 'check_box';
              });

              const targetState = !isAllVisibleSelected;

              visibleItems.forEach(el => {
                const cb = el.querySelector('.nb-ext-checkbox-native');
                if (cb) {
                  const isChecked = cb.textContent === 'check_box';
                  if (isChecked !== targetState) {
                    cb.click();
                  }
                }
              });
              
              setTimeout(() => this.refreshData(), 50);
            }
          }, true); // 必须使用捕获阶段
        }

        // 1. 同步全选 Checkbox
        const allCb = selectAllContainer.querySelector('input[type="checkbox"]');
        if (allCb && !allCb.hasNbExtListener) {
          allCb.hasNbExtListener = true;
          allCb.addEventListener('change', () => {
             console.log("[NB-Ext] Global Select-All changed, triggering deep UI refresh...");
             StorageManager.getNotebookConfig(this.notebookId).then(config => this.renderSidebarUI(config));
          });
        }
        
        // 2. 搜索按钮状态重构：v4.60 不再有静态 Input，此逻辑忽略

        // 3. 4.62: 启动侧边栏尺寸监听
        this.initSidebarObserver(sidebarContent);
      }
    }
  },

  // 4.62: 初始化 ResizeObserver
  initSidebarObserver(target) {
    if (this.sidebarObserver) return;
    
    this.sidebarObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        const rect = entry.target.getBoundingClientRect();
        this.currentSidebarWidth = rect.width;
        this.currentSidebarLeft = rect.left;
        this.updateSearchPanelPosition();
      }
    });
    this.sidebarObserver.observe(target);
  },

  updateSearchPanelPosition() {
    const panel = document.getElementById('nb-ext-search-panel');
    const sidebarContent = document.querySelector('.source-panel-content');
    if (panel && sidebarContent) {
      const rect = sidebarContent.getBoundingClientRect();
      this.currentSidebarWidth = rect.width;
      this.currentSidebarLeft = rect.left;
      
      // 保留微量边距 (左右各 8px)
      const targetWidth = this.currentSidebarWidth - 16;
      panel.style.width = `${targetWidth}px`;
      panel.style.left = `${this.currentSidebarLeft + 8}px`;
      
      // 4.63: 动态同步底部位置
      panel.style.top = 'unset';
      panel.style.bottom = '20px';
    }
  },

  async renderSidebarUI(config) {
    console.log("[NB-Ext] Render requested.");
    const sidebarContent = document.querySelector('.source-panel-content');
    let container = document.getElementById('nb-ext-container');
    let nativeHeader = document.querySelector('.source-panel-header');
    
    // 4.31-4.32: 自适应宿主定位器
    const selectAllContainer = sidebarContent ? (sidebarContent.querySelector('.select-all-sources-container') || sidebarContent.querySelector('.select-checkbox-all-sources-container')) : null;
    const sampleItem = document.querySelector('.single-source-container');
    // 优先采用用户建议的单项祖父节点作为宿主，回退到全选容器父级
    const angularHost = sampleItem ? sampleItem.parentElement?.parentElement : 
                        (selectAllContainer ? selectAllContainer.parentElement : null);
    
    const targetScrollArea = sidebarContent ? (sidebarContent.querySelector('.scroll-area-desktop') || sidebarContent.querySelector('.mat-drawer-inner-container')) : null;

    // 4.12: 预处理数据：排序与搜索
    const getFilteredAndSorted = (list) => {
      // 1. 记录原始索引（代表加入时间）
      const listWithMeta = list.map((item, idx) => ({ ...item, originalIndex: idx }));
      
      // 2. 4.63: 过滤逻辑统合至 applyFilter，此处仅处理原始列表索引
      let filtered = listWithMeta;
      // 移除原有的简易 includes 过滤，统一由 applyFilter 在渲染后处理显示隐藏

      // 3. 排序
      return filtered.sort((a, b) => {
        if (this.sortBy === 'name') {
          return a.name.localeCompare(b.name) * (this.sortOrder === 'asc' ? 1 : -1);
        } else {
          return (a.originalIndex - b.originalIndex) * (this.sortOrder === 'asc' ? 1 : -1);
        }
      });
    };

    const displaySources = getFilteredAndSorted(this.sources);
    const displayNotes = getFilteredAndSorted(this.notes);

    // 4.20: 挂载 ResizeObserver 监听收缩状态
    if (sidebarContent && !this.isObservingSidebar) {
      if (this.resizeObserver) {
        this.resizeObserver.observe(sidebarContent);
        this.isObservingSidebar = true;
      }
    }

    // 4.24: 直接隐藏整个原生的“滚动区”
    // (此处在下方挂载逻辑中统一处理变量，避免重复声明)

    // 4.22: 保险起见，继续维持对零散列表项的精准隐藏
    document.querySelectorAll('.source-stretched-button, .artifact-stretched-button').forEach(btn => {
      const listItem = btn.closest('.mat-mdc-list-item');
      if (listItem) {
        listItem.style.setProperty('display', 'none', 'important');
      }
    });

    // 4.6: 强力挂载方案 - 基于功能锚点定位
    if (!nativeHeader) {
      // 1. 寻找折叠/展开按钮（不分中英文 aria-label，通过类名或图标特征）
      const toggleBtn = document.querySelector('.toggle-source-panel-button') || 
                        document.querySelector('button[aria-label*="source panel"]') ||
                        document.querySelector('button[aria-label*="源面板"]');
      if (toggleBtn) {
        nativeHeader = toggleBtn.parentElement;
        console.log("[NB-Ext] Header found via Toggle Button.");
      }
    }

    if (!sidebarContent || !nativeHeader) {
      console.warn("[NB-Ext] Missing containers:", { sidebarContent, nativeHeader });
      return;
    }

    // 4.29-4.30: 精准挂载逻辑
    if (!container) {
      container = document.createElement('div');
      container.id = 'nb-ext-container';
      container.className = 'nb-ext-sidebar nb-ext-full-width';
    }

    // 4.30: 始终确保它进入用户指定的特定 Angular 宿主 div 内部
    if (angularHost) {
      // 4.54: 强制宿主容器为纵向流布局
      angularHost.style.setProperty('display', 'flex', 'important');
      angularHost.style.setProperty('flex-direction', 'column', 'important');
      angularHost.style.setProperty('align-items', 'stretch', 'important');

      // 4.54: 强制将全选容器移动到宿主顶部
      if (selectAllContainer && selectAllContainer.parentElement === angularHost) {
        if (angularHost.firstElementChild !== selectAllContainer) {
          angularHost.prepend(selectAllContainer);
        }
      }

      // 4.54: 扩展容器紧随全选容器之后
      if (container.parentElement !== angularHost) {
        if (selectAllContainer && selectAllContainer.parentElement === angularHost) {
          selectAllContainer.insertAdjacentElement('afterend', container);
        } else {
          angularHost.prepend(container);
        }
      } else {
        // 已在 parent 中，检查顺序
        if (selectAllContainer && selectAllContainer.parentElement === angularHost) {
          if (container.previousElementSibling !== selectAllContainer) {
             selectAllContainer.insertAdjacentElement('afterend', container);
          }
        }
      }
    } else if (selectAllContainer) {
      // 降级方案：若找不到属性 div，则维持在全选容器之后
      if (container.previousElementSibling !== selectAllContainer) {
        selectAllContainer.insertAdjacentElement('afterend', container);
      }
    } else if (targetScrollArea) {
      if (container.nextElementSibling !== targetScrollArea) {
        targetScrollArea.parentElement.insertBefore(container, targetScrollArea);
      }
    } else if (sidebarContent && !container.parentElement) {
      sidebarContent.prepend(container);
    }

    console.log("[NB-Ext] Container status:", container.id, "Items Found:", this.sources.length);

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // 4.60: 浮动搜索功能。不再常驻顶部 searchContainer
    // 搜索面板渲染逻辑移至 toggleSearchPanel

    const unassignedItems = this.sources.filter(s => 
      !config.folders.some(f => f.itemIds.includes(s.id))
    );

    // Toolbar
    if (nativeHeader) {
      nativeHeader.style.position = 'relative'; // 为居中提供对齐上下文
      nativeHeader.style.display = 'flex';      // 4.14: 确定性强制同行
      nativeHeader.style.alignItems = 'center'; 
      nativeHeader.style.justifyContent = 'space-between';
      nativeHeader.style.flexWrap = 'nowrap';
    // 4.25: 搜索条整合到“全选”容器 (v4.60 已废弃此处搜索逻辑)
    if (selectAllContainer) {
      selectAllContainer.style.setProperty('display', 'flex', 'important');
      selectAllContainer.style.setProperty('align-items', 'center', 'important');
      selectAllContainer.style.setProperty('gap', '12px', 'important');
      selectAllContainer.style.setProperty('padding-left', '8px', 'important');
    }

    this.applyFilter();

    let folderList = container.querySelector('.nb-ext-folder-list');
      let toolbar = nativeHeader.querySelector('.nb-ext-toolbar');
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'nb-ext-toolbar';
        
        // 4.10: 插入逻辑优化
        const firstBtn = nativeHeader.querySelector('button');
        if (firstBtn) {
          nativeHeader.insertBefore(toolbar, firstBtn);
        } else {
          nativeHeader.appendChild(toolbar);
        }
      }
      toolbar.textContent = ''; 

      // 4.60: 浮动搜索触发按钮
      const searchTrigger = document.createElement('div');
      searchTrigger.className = `nb-ext-toolbar-icon ${this.isSearchOpen ? 'active' : ''}`;
      const searchTriggerIcon = document.createElement('span');
      searchTriggerIcon.className = 'material-symbols-outlined';
      searchTriggerIcon.textContent = 'search';
      searchTrigger.appendChild(searchTriggerIcon);
      searchTrigger.title = 'Advanced Search (Space=OR, +=AND)';
      searchTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSearchPanel();
      });
      toolbar.appendChild(searchTrigger);
      
      const viewToggle = document.createElement('div');
      viewToggle.className = `nb-ext-toolbar-icon ${this.treeViewEnabled ? 'active' : ''}`;
      const viewIcon = document.createElement('span');
      viewIcon.className = 'material-symbols-outlined';
      viewIcon.textContent = this.treeViewEnabled ? 'account_tree' : 'view_list';
      viewToggle.appendChild(viewIcon);
      viewToggle.title = this.treeViewEnabled ? '切换到简约列表' : '切换到目录树';
      viewToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.treeViewEnabled = !this.treeViewEnabled;
        chrome.storage.local.set({ 'nb_ext_tree_enabled': this.treeViewEnabled });
        this.refreshData();
      });

      const modeToggle = document.createElement('div');
      modeToggle.className = `nb-ext-toolbar-icon`;
      const modeIcon = document.createElement('span');
      modeIcon.className = 'material-symbols-outlined';
      modeIcon.textContent = this.displayMode === 'single' ? 'view_headline' : 'view_agenda';
      modeToggle.appendChild(modeIcon);
      modeToggle.title = this.displayMode === 'single' ? '切换到双行显示' : '切换到单行显示';
      modeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.displayMode = this.displayMode === 'single' ? 'double' : 'single';
        chrome.storage.local.set({ 'nb_ext_display_mode': this.displayMode });
        this.refreshData();
      });

      const addDirBtn = document.createElement('div');
      addDirBtn.className = `nb-ext-toolbar-icon`;
      const addIcon = document.createElement('span');
      addIcon.className = 'material-symbols-outlined';
      addIcon.textContent = 'create_new_folder';
      addDirBtn.appendChild(addIcon);
      addDirBtn.title = 'Create Folder';
      addDirBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isAddingFolder = !this.isAddingFolder;
        this.refreshData();
      });

      // 4.12: 排序按钮
      const sortBtn = document.createElement('div');
      sortBtn.className = `nb-ext-toolbar-icon ${this.sortBy === 'name' ? 'active' : ''}`;
      const sortIcon = document.createElement('span');
      sortIcon.className = 'material-symbols-outlined';
      sortIcon.textContent = this.sortBy === 'name' ? 'sort_by_alpha' : 'schedule';
      sortBtn.appendChild(sortIcon);
      sortBtn.title = this.sortBy === 'name' ? 'Sorted by Name (Click to sort by Date)' : 'Sorted by Date (Click to sort by Name)';
      sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sortBy = this.sortBy === 'name' ? 'time' : 'name';
        this.refreshData();
      });

      toolbar.appendChild(viewToggle);
      toolbar.appendChild(modeToggle);
      toolbar.appendChild(sortBtn);
      toolbar.appendChild(addDirBtn);
    }

    // Inline Folder Creator
    if (this.isAddingFolder) {
      const creator = document.createElement('div');
      creator.className = 'nb-ext-folder-creator';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Folder name...';
      input.className = 'nb-ext-input';
      
        input.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter' && input.value) {
            await this.addFolderWithName(input.value);
            this.isAddingFolder = false;
            this.refreshData();
          } else if (e.key === 'Escape') {
            this.isAddingFolder = false;
            this.refreshData();
          }
        });

        const saveBtn = document.createElement('div');
        saveBtn.className = 'nb-ext-add-btn';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', async () => {
          if (input.value) {
            await this.addFolderWithName(input.value);
            this.isAddingFolder = false;
            this.refreshData();
          }
        });

      creator.appendChild(input);
      creator.appendChild(saveBtn);
      container.appendChild(creator);
      setTimeout(() => input.focus(), 100);
    }

    // 4.3: 根据视图模式渲染列表
    if (this.treeViewEnabled) {
      // Tree List
      const folderList = document.createElement('div');
      folderList.id = 'nb-ext-folder-list';
      
      config.folders.forEach(f => {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'nb-ext-folder';

        const isCollapsed = this.collapsedFolderIds.includes(f.id);
        
        folderDiv.className = `nb-ext-folder ${isCollapsed ? 'collapsed' : ''}`;

        const folderTitle = document.createElement('div');
        folderTitle.className = 'nb-ext-folder-title';

        // 4.9: 原生蓝色勾选框 (✓) - 映射原始 Checkbox 状态
        const isAllSelected = f.itemIds.length > 0 && f.itemIds.every(id => {
          const item = [...this.sources, ...this.notes].find(i => i.id === id);
          return item && item.checkbox && item.checkbox.checked;
        });

        const fbBox = document.createElement('span');
        fbBox.className = 'nb-ext-checkbox-native material-symbols-outlined';
        fbBox.textContent = isAllSelected ? 'check_box' : 'check_box_outline_blank';
        fbBox.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFolderSelection(f.id, !isAllSelected);
        });
        folderTitle.appendChild(fbBox);
        
        // 4.9: 增加折叠箭头
        const arrow = document.createElement('span');
        arrow.className = `nb-ext-folder-arrow material-symbols-outlined ${isCollapsed ? '' : 'expanded'}`;
        arrow.textContent = 'chevron_right';
        folderTitle.appendChild(arrow);

        const icon = document.createElement('span');
        icon.className = 'nb-ext-folder-icon material-symbols-outlined';
        icon.textContent = isCollapsed ? 'folder' : 'folder_open';
        folderTitle.appendChild(icon);

        if (this.editingFolderId === f.id) {
          // 4.35: 行内编辑模式
          const nameInput = document.createElement('input');
          nameInput.type = 'text';
          nameInput.className = 'nb-ext-inline-edit-input';
          nameInput.value = f.name;
          nameInput.addEventListener('click', (e) => e.stopPropagation());
          nameInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
              if (nameInput.value) await this.renameFolder(f.id, nameInput.value);
              this.editingFolderId = null;
              this.refreshData();
            } else if (e.key === 'Escape') {
              this.editingFolderId = null;
              this.refreshData();
            }
          });
          nameInput.addEventListener('blur', async () => {
             if (this.editingFolderId === f.id) {
               if (nameInput.value && nameInput.value !== f.name) {
                 await this.renameFolder(f.id, nameInput.value);
               }
               this.editingFolderId = null;
               this.refreshData();
             }
          });
          folderTitle.appendChild(nameInput);
          setTimeout(() => nameInput.focus(), 50);
        } else {
          const nameSpan = document.createElement('span');
          nameSpan.className = 'nb-ext-text-truncate nb-ext-folder-name';
          // 4.28: 增加目录文件数统计样式：目录名 (数量)
          nameSpan.textContent = `${f.name} (${f.itemIds.length})`;
          // 点击整行切换折叠
          folderTitle.addEventListener('click', () => {
            if (isCollapsed) {
              this.collapsedFolderIds = this.collapsedFolderIds.filter(id => id !== f.id);
            } else {
              this.collapsedFolderIds.push(f.id);
            }
            chrome.storage.local.set({ 'nb_ext_collapsed_ids': this.collapsedFolderIds });
            this.refreshData();
          });
          folderTitle.appendChild(nameSpan);
        }

        const editBtn = document.createElement('span');
        editBtn.className = 'nb-ext-action-icon material-symbols-outlined';
        editBtn.textContent = 'edit';
        editBtn.title = 'Rename Folder';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.editingFolderId = f.id;
          this.refreshData();
        });

        const delBtn = document.createElement('span');
        delBtn.className = 'nb-ext-action-icon material-symbols-outlined';
        delBtn.textContent = 'delete';
        delBtn.title = 'Delete Folder';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const choice = confirm(`[OK]: Delete folder only\n[Cancel]: Delete folder AND its documents`);
          if (choice) await this.removeFolderOnly(f.id);
          else await this.removeFolderAndItems(f.id);
        });
        
        folderTitle.appendChild(editBtn);
        folderTitle.appendChild(delBtn);
        folderDiv.appendChild(folderTitle);

        if (!isCollapsed) {
          const folderContent = document.createElement('div');
          folderContent.className = 'nb-ext-folder-content';

          f.itemIds.forEach(itemId => {
            const item = [...this.sources, ...this.notes].find(i => i.id === itemId);
            if (item) {
              const itemDiv = document.createElement('div');
              itemDiv.className = `nb-ext-item nb-ext-display-${this.displayMode}`;

              const isItemSelected = item.checkbox ? item.checkbox.checked : false;
              const itemBox = document.createElement('span');
              itemBox.className = 'nb-ext-checkbox-native material-symbols-outlined';
              itemBox.textContent = isItemSelected ? 'check_box' : 'check_box_outline_blank';
              itemBox.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.checkbox) item.checkbox.click();
              });
              itemDiv.appendChild(itemBox);

              const itemIcon = document.createElement('span');
              itemIcon.className = 'nb-ext-item-icon material-symbols-outlined';
              itemIcon.textContent = this.getFileIcon(item.name);
              itemDiv.appendChild(itemIcon);

              const label = document.createElement('span');
              label.className = 'nb-ext-source-label';
              label.textContent = item.name;
              label.onclick = () => item.element.click();
              itemDiv.appendChild(label);

              // 4.8: 浮动归类
              itemDiv.appendChild(this.createMoveTrigger(item));

              folderContent.appendChild(itemDiv);
            }
          });
          folderDiv.appendChild(folderContent);
        }
        folderList.appendChild(folderDiv);
      });
      
      container.appendChild(folderList);

      // Unassigned List (仅在 Tree 模式下显示待分类标题)
      const unassignedDiv = document.createElement('div');
      unassignedDiv.className = 'nb-ext-unassigned';
      
      const unassignedTitle = document.createElement('div');
      unassignedTitle.className = 'nb-ext-unassigned-title';
      unassignedTitle.textContent = `Unassigned (${unassignedItems.length})`;
      unassignedDiv.appendChild(unassignedTitle);

      unassignedItems.forEach(item => {
        unassignedDiv.appendChild(this.createItemRow(item));
      });

      container.appendChild(unassignedDiv);
    } else {
      // 4.3: 简约列表模式 - 平铺所有文件，不显示文件夹/待分类
      const flatList = document.createElement('div');
      flatList.className = 'nb-ext-flat-list';
      
      this.sources.forEach(item => {
        flatList.appendChild(this.createItemRow(item));
      });
      
      container.appendChild(flatList);
    }

    // 4.63: 渲染循环最后一步，强制应用搜索过滤
    this.applyFilter();
  },

  // 4.3: 提取通用行构建方法
  createItemRow(item) {
    const row = document.createElement('div');
    row.className = `nb-ext-item-row nb-ext-display-${this.displayMode}`;

    const isItemSelected = item.checkbox ? item.checkbox.checked : false;
    const itemBox = document.createElement('span');
    itemBox.className = 'nb-ext-checkbox-native material-symbols-outlined';
    itemBox.textContent = isItemSelected ? 'check_box' : 'check_box_outline_blank';
    itemBox.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.checkbox) item.checkbox.click();
    });
    row.appendChild(itemBox);

    const itemIcon = document.createElement('span');
    itemIcon.className = 'nb-ext-item-icon material-symbols-outlined';
    itemIcon.textContent = this.getFileIcon(item.name);
    row.appendChild(itemIcon);

    const itemLabel = document.createElement('div');
    itemLabel.className = 'nb-ext-source-label';
    itemLabel.textContent = item.name;
    itemLabel.onclick = () => item.element.click();
    row.appendChild(itemLabel);

    // 4.8: 浮动归类
    row.appendChild(this.createMoveTrigger(item));
    
    return row;
  },

  // 4.8 & 4.9: 提取浮动归类逻辑
  createMoveTrigger(item) {
    const moveTrigger = document.createElement('div');
    moveTrigger.className = 'nb-ext-move-trigger';
    const moveIcon = document.createElement('span');
    moveIcon.className = 'material-symbols-outlined';
    moveIcon.textContent = 'folder_open';
    moveTrigger.appendChild(moveIcon);
    
    const select = document.createElement('select');
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Move to...';
    select.appendChild(defaultOpt);

    StorageManager.getNotebookConfig(this.notebookId).then(config => {
      config.folders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        select.appendChild(opt);
      });
    });

    select.addEventListener('change', (e) => {
      this.moveItemToFolder(item.id, e.target.value);
    });
    
    moveTrigger.appendChild(select);
    return moveTrigger;
  },

  // 4.11: 后缀名识别
  getFileIcon(filename) {
    if (!filename) return 'description';
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
      'pdf': 'picture_as_pdf',
      'doc': 'article', 'docx': 'article',
      'xls': 'table_view', 'xlsx': 'table_view', 'csv': 'table_view',
      'ppt': 'present_to_all', 'pptx': 'present_to_all',
      'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image', 'webp': 'image',
      'txt': 'notes', 'md': 'description',
      'zip': 'folder_zip', 'rar': 'folder_zip', '7z': 'folder_zip',
      'html': 'html', 'js': 'javascript', 'css': 'css',
      'mp3': 'audio_file', 'wav': 'audio_file',
      'mp4': 'video_file', 'mov': 'video_file'
    };
    return map[ext] || 'description';
  },

  async toggleFolderSelection(folderId, isChecked) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    const folder = config.folders.find(f => f.id === folderId);
    if (!folder) return;

    folder.itemIds.forEach(itemId => {
      const item = [...this.sources, ...this.notes].find(i => i.id === itemId);
      if (item && item.checkbox && item.checkbox.checked !== isChecked) {
        // 4.26: 增强派发，确保 Angular 监听 change 事件
        item.checkbox.checked = isChecked;
        item.checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        item.checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        item.checkbox.click(); // 保留 click 以触发点击行为相关的 UI 更新
      }
    });

    // 强制触发一次 UI 刷新（图标状态）
    this.renderSidebarUI(config);
  },

  // 4.60: 触发/渲染浮动搜索面板
  toggleSearchPanel() {
    this.isSearchOpen = !this.isSearchOpen;
    let panel = document.getElementById('nb-ext-search-panel');
    
    if (this.isSearchOpen) {
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'nb-ext-search-panel';
        panel.className = 'nb-ext-search-panel';
        document.body.appendChild(panel);
      }
      // 4.62: 初次渲染立即同步位置
      this.updateSearchPanelPosition();

      panel.innerHTML = `
        <div class="nb-ext-search-box">
          <span class="material-symbols-outlined search-hint-icon">search</span>
          <input type="text" class="nb-ext-search-input-float" placeholder="Advanced Search... (Space=OR, +=AND)" value="${this.searchQuery}" />
          <span class="material-symbols-outlined search-close-icon">close</span>
        </div>
        <div class="nb-ext-search-help">
          Example: "doc pdf + 2025" matches (doc OR pdf) AND 2025
        </div>
      `;
      
      const input = panel.querySelector('input');
      setTimeout(() => input.focus(), 50);
      
      // 4.61: 增加 IME 支持
      input.addEventListener('compositionstart', () => { this.isComposing = true; });
      input.addEventListener('compositionend', (e) => {
        this.isComposing = false;
        this.searchQuery = e.target.value;
        this.applyFilter();
      });

      input.addEventListener('input', (e) => {
        if (this.isComposing) return; // 4.61: 拼音输入过程中不触发过滤
        this.searchQuery = e.target.value;
        this.applyFilter();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.toggleSearchPanel();
      });

      panel.querySelector('.search-close-icon').addEventListener('click', () => {
        this.toggleSearchPanel();
      });

      // 同步工具栏按钮深度状态
      this.refreshToolbarStatus();
    } else {
      if (panel) panel.remove();
      // 4.71: 搜索框消失时，取消过滤
      this.searchQuery = '';
      this.applyFilter();
      
      this.refreshToolbarStatus();
    }
  },

  refreshToolbarStatus() {
     const trigger = document.querySelector('.nb-ext-toolbar-icon:has(span[textContent="search"])');
     if (trigger) {
       trigger.classList.toggle('active', this.isSearchOpen);
     }
  },

  // 4.60: 高级过滤逻辑：+ = AND, Space = OR
  applyFilter() {
    const query = this.searchQuery.trim().toLowerCase();
    const items = document.querySelectorAll('.nb-ext-item, .nb-ext-item-row');
    const folders = document.querySelectorAll('.nb-ext-folder');
    const unassignedArea = document.querySelector('.nb-ext-unassigned');

    // 逻辑引擎：
    // 1. 按 '+' 分割必选组 (AND)
    // 2. 每组内按 空格 分割备选项 (OR)
    const andGroups = query.split('+').map(g => g.trim()).filter(g => g);

    const matches = (text) => {
      text = text.toLowerCase();
      if (!query) return true;
      
      // 必须满足每一个 AND 组
      return andGroups.every(group => {
        const orTerms = group.split(/\s+/).filter(t => t);
        // 组内只要命中一个任一 Term 即代表该组满足 (OR)
        return orTerms.some(term => text.includes(term));
      });
    };

    items.forEach(el => {
      const text = el.querySelector('.nb-ext-source-label')?.textContent || el.textContent;
      const isVisible = matches(text);
      // 4.64: 改用 classList 切换，避免被 CSS 中的 !important 覆盖
      if (isVisible) el.classList.remove('nb-ext-hidden');
      else el.classList.add('nb-ext-hidden');
    });

    // 树模式下的目录也要检查是否有子节点可见
    folders.forEach(el => {
      if (!query) {
        el.classList.remove('nb-ext-hidden');
        return;
      }
      const hasVisibleChild = Array.from(el.querySelectorAll('.nb-ext-item'))
        .some(item => !item.classList.contains('nb-ext-hidden'));
      
      if (hasVisibleChild) el.classList.remove('nb-ext-hidden');
      else el.classList.add('nb-ext-hidden');
      
      if (hasVisibleChild) {
        el.classList.remove('collapsed');
        const arrow = el.querySelector('.nb-ext-folder-arrow');
        if (arrow) arrow.classList.add('expanded');
      }
    });

    // 4.61: 待分类区域过滤与标题状态同步
    if (unassignedArea) {
      if (!query) {
        unassignedArea.classList.remove('nb-ext-hidden');
        const title = unassignedArea.querySelector('.nb-ext-unassigned-title');
        if (title) title.classList.remove('nb-ext-hidden');
      } else {
        const hasVisibleItem = Array.from(unassignedArea.querySelectorAll('.nb-ext-item-row'))
          .some(item => !item.classList.contains('nb-ext-hidden'));
        
        if (hasVisibleItem) unassignedArea.classList.remove('nb-ext-hidden');
        else unassignedArea.classList.add('nb-ext-hidden');
        
        const title = unassignedArea.querySelector('.nb-ext-unassigned-title');
        if (title) {
          if (hasVisibleItem) title.classList.remove('nb-ext-hidden');
          else title.classList.add('nb-ext-hidden');
        }
      }
    }
  },

  async addFolderWithName(name) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    config.folders.push({
      id: Date.now().toString(),
      name: name,
      itemIds: []
    });
    await StorageManager.saveNotebookConfig(this.notebookId, config);
  },

  async renameFolder(folderId, newName) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    const folder = config.folders.find(f => f.id === folderId);
    if (folder) {
      folder.name = newName;
      await StorageManager.saveNotebookConfig(this.notebookId, config);
      this.refreshData();
    }
  },

  async removeFolderOnly(folderId) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    config.folders = config.folders.filter(f => f.id !== folderId);
    await StorageManager.saveNotebookConfig(this.notebookId, config);
    this.refreshData();
  },

  async removeFolderAndItems(folderId) {
    const config = await StorageManager.getNotebookConfig(this.notebookId);
    const folder = config.folders.find(f => f.id === folderId);
    
    if (folder) {
      // 这里的“彻底删除文档”需要谨慎实现。
      // 因为我们没有 API，只能尝试触发原生的删除 UI。
      // 由于这涉及多个步骤且极易出错，目前的策略是：
      // 将文件夹及其关联的数据从插件存储中移除。
      // 注意：由于无法可靠地批量点击原生的“删除”并确认，
      // 我们在此告知用户需要手动在 NotebookLM 中删除 Source。
      alert("插件已移除文件夹配置。请注意：插件无法直接删除 NotebookLM 内部的原始文档，请手动删除它们。");
      
      config.folders = config.folders.filter(f => f.id !== folderId);
      await StorageManager.saveNotebookConfig(this.notebookId, config);
      this.refreshData();
    }
  },

  async moveItemToFolder(itemId, folderId) {
    // 4.1: 记录当前滚动位置，防止归档后跳转
    const sidebarContent = document.querySelector('.source-panel-content');
    const lastScrollTop = sidebarContent ? sidebarContent.scrollTop : 0;

    const config = await StorageManager.getNotebookConfig(this.notebookId);
    
    config.folders.forEach(f => {
      f.itemIds = f.itemIds.filter(id => id !== itemId);
    });

    if (folderId) {
      const folder = config.folders.find(f => f.id === folderId);
      if (folder) folder.itemIds.push(itemId);
    }

    await StorageManager.saveNotebookConfig(this.notebookId, config);
    
    await this.refreshData();

    // 4.1: 恢复滚动位置
    if (sidebarContent) {
      sidebarContent.scrollTop = lastScrollTop;
    }
  }
};

// 延迟初始化以确保 DOM 加载
setTimeout(() => NotebookManager.init(), 2000);
