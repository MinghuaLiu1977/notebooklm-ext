# Implementation Plan - NotebookLM 扩展 v4.0

## 目标
扩展功能条，优化侧边栏交互体验，使其在支持大批量文档时更加高效且美观。

## 提议的变更

### 1. 工具栏扩展 (Toolbar Expansion)
*   **[MODIFY] [content.js](file:///Users/minghualiu/personal/EastlakeStudio/notebooklm_ext/scripts/content.js)**
    *   将 Header 中的 `＋文件夹` 替换为包含多个图标按钮的工具栏。
    *   增加 `treeViewEnabled`: 控制目录树视图的显示/隐藏（类似原生的开关）。
    *   增加 `displayMode`: 支持 `single` (单行截断) 和 `double` (两行截断) 模式。
    *   保留 `addFolder`: 创建文件夹功能。

### 2. 待分类列表交互优化 (Unassigned List Polish)
*   **[MODIFY] [content.js](file:///Users/minghualiu/personal/EastlakeStudio/notebooklm_ext/scripts/content.js)**
    *   待分类文档项：增加复选框（Checkbox）支持。
    *   归类下拉框 (Select)：默认隐藏，仅在鼠标悬停 (Hover) 时显示，并使用图标触发。
    *   字体颜色：适配深色模式下更柔和的文本颜色，避免刺眼。

### 9. 目录交互增强与 Header 对齐 (v4.9 - 当前)
*   **[MODIFY] [content.js](file:///Users/minghualiu/personal/EastlakeStudio/notebooklm_ext/scripts/content.js)**
    *   **Header 居中布局**：调整工具栏注入逻辑，使其位于标题和收缩按钮中间，并使用 Flex 布局实现绝对垂直水平居中。
    * ### [v4.15] Header 垂直对齐精调
- 通过 `translateY(-2px)` 实现视觉中心补偿，对齐原生按钮。
- 优化图标点击区域尺寸。

### [v4.12] 搜索过滤与多维排序系统
- **核心逻辑**：
  - 新增 `searchQuery`, `sortBy`, `sortOrder` 状态管理。
  - 在渲染循环前实施 `filter()` 和 `sort()` 数据流水线。
- **UI 组件**：
  - **搜索条**：位于 Header 正下方，支持实时响应（Debounce）。
  - **排序控制**：在工具栏增加排序维度切换（名称/时间）。
- **树视图兼容**：搜索命中时自动展开对应的父级目录。

### [v4.11] 智能图标与布局加固
- 实现 `getFileIcon` 基于后缀名的图标映射
- 移除 `absolute` 定位，改用 Flex 居中方案解决重叠冲突
  *   **原生复选框 (✓)**：使用 `material-symbols` 渲染 `check_box` 和 `check_box_outline_blank`，颜色匹配原生的 Google Blue (#1a73e8)。
    *   **级联勾选**：点击目录复选框时，自动触发线下所有文件的勾选动作。
*   **[MODIFY] [main.css](file:///Users/minghualiu/personal/EastlakeStudio/notebooklm_ext/styles/main.css)**
    *   **Header 对齐精调**：为 `.source-panel-header` 实施强 Flex 规则。
    *   **Checkmark 动画**：为模拟的复选框增加点击动效，使其手感接近原生。
*   **[MODIFY] [main.css](file:///Users/minghualiu/personal/EastlakeStudio/notebooklm_ext/styles/main.css)**
    *   **移除诊断样式**：清除 v4.5 临时添加的红色背景和最小高度限制。

### 5. 布局重构与平铺视图 (v4.3 - 当前)
*   **[MODIFY] [content.js](file:///Users/minghualiu/personal/EastlakeStudio/notebooklm_ext/scripts/content.js)**
    *   **迁移工具栏**：定位原生 `.source-panel-header`，将 `nb-ext-toolbar` 在页面加载后手动插入到标题和关闭按钮之间。
    *   **视图逻辑**：当 `treeViewEnabled === false` 时，不再渲染任何文件夹和“待分类”标题，而是直接以平铺列表显示全部 `sources`。
    *   **图标对齐**：平铺模式下保持与 Tree 模式一致的图标与文本间距。
*   **[MODIFY] [main.css](file:///Users/minghualiu/personal/EastlakeStudio/notebooklm_ext/styles/main.css)**
    *   **Header Toolbar 适配**：去掉工具栏背景和边框，使其在 Header 中显现为透明的一组图标。
    *   **列表样式**：优化平铺列表的左间距，使其看起来更自然。

## 验证计划

### 自动化/手动验证
1.  **视图开关**：点击 Tree View 开关，确保目录结构能动态切换显示。
2.  **模式切换**：切换单/双行模式，观察长文文件名是否能正确截断（两行模式下应可见更多信息）。
3.  **待分类交互**：鼠标移入待分类项，确认归类图标能平滑出现。
4.  **保存状态**：所有设置（视图、模式）应持久化到 `chrome.storage`。
1.  **Header 注入验证**：检查 `nb-ext-toolbar` 是否正确出现在 Sources 标题旁。
2.  **Trusted Types 校验**：确认控制台不再出现 `TrustedScript` 拦截报错。
### [v4.23] 重构渲染引擎：精准定位与 Trusted Types 适配
- **DOM 层级修正**：
  - **注入位置**：找到 `.scroll-area-desktop` 组件，获取其父容器。
  - **插入策略**：将 `#nb-ext-container` 插入到 `.scroll-area-desktop` **之前**（`parentElement.insertBefore`），使其作为父容器的第一个子节点，与原生滚动区并列。
- **渲染核心升级**：
  - **全量移除 `innerHTML`**：针对 Trusted Types 拦截，所有 UI 片段均通过 `document.createElement` 手动构建。
  - **组件隔离**：确保 `#nb-ext-container` 的类名仅为 `.nb-ext-sidebar` (及布局类)，绝不混用 `.nb-ext-toolbar`。
- **视觉补偿**：
  - 调整 CSS，确保并列后的高度分配正常，不影响原生 Add Sources 按钮的底部粘滞。
### [v4.25] 搜索与全选横向整合
- **UI 布局重组**：
  - 定位并接管 `.select-all-sources-container`。
  - 将搜索输入框从扩展容器移至全选容器内部横向排布。
  - 优化搜索框样式，使其在紧凑行中不仅美观且不遮挡“全选”文字。
### [v4.26] 修复目录全选点击失效
- **执行逻辑增强**：
  - 在 `toggleFolderSelection` 中，除了 `click()` 之外，增加 `dispatchEvent(new Event('change', { bubbles: true }))`，确保响应式框架（Angular）感知状态变化。
  - 确保寻找原生 Checkbox 的逻辑不仅限于 `input`，如果存在父级容器则点击父级容器。
### [v4.67] 全局文本样式统合
- **属性前置**：由于 `.nb-ext-item-row` 没有默认的继承样式，导致未分类区的文字和目录内 `.nb-ext-item` 的文字样式不一。现在将 `font-size: 13px !important;` 和 `color: var(--nb-ext-text-soft) !important;` 直接放置到最内层 `.nb-ext-source-label` 上，彻底统一视觉表现。

### [v4.66] 提升新建目录交互体验
- **Esc 取消**：为 `.nb-ext-folder-creator` 的输入框增加 `keydown` 监听，捕捉 `Escape` 键。触发时自动将 `isAddingFolder` 设为 `false` 并 `refreshData()` 刷新界面，从而无损取消新建流程。

### [v4.65] 类名统合与最高优先级隐藏
- **统一标识**：将目录和待分类文件的显示文字统一为 `.nb-ext-source-label`。
- **强制沉底**：将强力隐藏类 `.nb-ext-hidden` 置于 CSS 最末尾，确保规则必定生效。

### [v4.64] 搜索过滤“强力隐藏”修复
- **优先级冲突解决**：
  - **CSS 增强**：引入 `.nb-ext-hidden { display: none !important; }`，以最高优先级抑制 `.nb-ext-item` 的 `display: flex !important` 样式。
  - **逻辑重构**：将 JS 中的 `.style.display = 'none'` 替换为 `.classList.add('nb-ext-hidden')`。
- **层级过滤**：
  - 确保文件夹联动（Folder Nesting）逻辑正确判断子元素是否具有 `.nb-ext-hidden` 类。
  - 修复“待分类”区域及其标题的显示逻辑。

### [v4.63] 过滤功能可靠性修复与位置优化
- **过滤核心修复**：在 `renderSidebarUI` 结束时同步调用 `applyFilter()`，确保数据刷新后过滤状态不丢失。
- **位置体验升级**：
  - **位置下移**：将搜索面板从顶部（Top: 140px）移至侧边栏底部（Bottom: 20px）。
  - **视觉避让**：解决先前叠在“Add Source”按钮上的视觉冲突，使界面层级更清晰。
  - **交互逻辑**：同步调整 ResizeObserver 随动逻辑中的定位属性。

### [v4.62] 搜索面板宽度动态随动
- **核心机制**：引入 `ResizeObserver` 监听侧边栏容器（`angularHost`）的尺寸变化。
- **宽度同步**：实时将侧边栏的宽度值（扣除左右 Margin/Padding）应用到悬浮的 `nb-ext-search-panel` 上。
- **自适应定位**：优化面板的 `left` 定位策略，确保在不同侧边栏宽度下始终对齐。

### [v4.61] 搜索体验补完与 IME 兼容
- **逻辑优化**：
  - **全量过滤**：扩展搜索范围至“未分类”文件区域，确保无死角过滤。
  - **IME 兼容**：监听 `compositionstart/end` 事件，避免在拼音输入过程中触发不完整的过滤逻辑。
- **UI 对齐**：
  - **宽度自适应**：将搜索弹出框宽度调整为与侧边栏一致（约 280px），提升视觉统一感。
- **状态管理**：
  - 在无匹配项时，自动隐藏“未分类”标题。

### [v4.60] 浮动高级搜索系统
- **交互重构**：
  - 移除侧边栏静态搜索框。
  - 在工具栏新增“搜索”图标按钮。
  - 点击按钮触发浮动弹出式搜索面板（悬浮于侧边栏上方，支持毛玻璃点击淡入效果）。
- **高级匹配逻辑**：
  - **空格 ( )**: 表示“或”(OR) 关系。
  - **加号 (+)**: 表示“与”(AND) 关系。
  - **算法实现**：先按 `+` 切分为必选组，各组内按空格切分为备选项，所有必选组均需命中（组内命中任一备选项即可）。
- **视觉风格**：采用 Premium 微动画背景，搜索框自动对焦。

### [v4.54] 全选容器强制置顶
- **问题定义**：原生 NotebookLM 布局可能将“全选”放在底部，导致与扩展列表层级错位。
- **重构方案**：
  - 强制将 `selectAllContainer` 挂载到侧边栏内容区的第一个位置（`prepend` 到 `angularHost`）。
  - 确保扩展 `container` 紧跟其后。
  - 移除 `selectAllContainer` 上的多余 Flex 设置，回归原生自然的占位布局。
- **目的**：实现“全选 -> 搜索 -> 列表”的逻辑垂直流向。

### [v4.53] 搜索框位置重构
- **现状方案**：搜索框目前挂载在底部的“全选”容器中，导致视觉层级混乱且容易被遮挡。
- **改进方案**：
  - 将搜索框从 `selectAllContainer` 移出。
  - 重新挂载到侧边栏顶部工具栏下方，作为独立的导航组件。
  - 调整 CSS，确保搜索框在侧边栏具备独立的间距和品牌感背景。
- **收益**：符合用户搜索习惯（顶部优先），不再干扰底部的全选操作。

### [v4.52] 亮暗主题自适应系统
- **机制原理**：基于 `body.dark-theme` 类名实现色彩变量切换。
- **色彩变量系统**：
  - `--nb-ext-bg`: 亮景 #FFFFFF | 暗景 #1f1f1f
  - `--nb-ext-text`: 亮景 #202124 | 暗景 #e3e3e3
  - `--nb-ext-hover`: 亮景 rgba(0,0,0,0.04) | 暗景 rgba(255,255,255,0.08)
  - `--nb-ext-border`: 亮景 #dadce0 | 暗景 #444746
- **CSS 改造**：全量移除 `main.css` 中的硬编码色值，改用上述变量。

### [v4.51] 品牌色彩回滚
- **图标回归**：将最外层弧线由纯红恢复为经典的 Google Red (#EA4335)，并同步更新 PNG 资源以确保最佳兼容性。评分：10/10。
