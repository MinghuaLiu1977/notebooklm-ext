# NotebookLM Enhancer (Browser Extension)

**NotebookLM Enhancer** is an unofficial browser extension deeply customized for Google NotebookLM. It addresses interaction pain points in the native interface when handling massive documents by introducing **directory management**, an **advanced search system**, **responsive UI adjustments**, and **deep system integration**, significantly enhancing knowledge management efficiency and the reading experience.

![NotebookLM Enhancer Logo](icons/icon.svg)

---

## 🌟 Key Features

### 📁 1. Structured Directory System (Tree View Management)
Native NotebookLM only provides a flat document list. This extension implements true directory management through interception and injection:
- **Seamless Creation & Renaming**: One-click folder creation (supports `Esc` to cancel), and double-click folder names for inline renaming.
- **Unified Action Menu**: Each document has a dedicated "More actions" trigger that appears on hover, allowing you to **Move to folder**, **Rename**, or **Delete** with ease.
- **Intelligent Unassigned Section**: Automatically isolates documents not associated with any directory into a "Pending Classification" area at the bottom.
- **Cascading Multi-selection**: Clicking a folder checkbox automatically selects all its child documents, greatly improving batch processing efficiency.

### 🔍 2. Advanced Floating Search System
Break free from the barely noticeable native search box with a modern retrieval experience (Added since v4.60+):
- **Frosted Glass Floating Panel**: Click the search icon in the toolbar to reveal a sliding search panel that doesn't consume valuable vertical space.
- **Adaptive Width Design**: The search panel width utilizes `ResizeObserver` to perceive sidebar drag actions in real-time, ensuring perfect alignment.
- **Advanced Logical Filtering**:
  - Supports **Space (` `)** for `OR` logic matching.
  - Supports **Plus (`+`)** for `AND` logic matching.
- **IME Friendly**: Perfectly supports input methods like Chinese Pinyin, triggering filtering only after composition is complete.
- **Hierarchical Penetration**: Filtering not only hides documents but also intelligently hides empty folders and category headers to keep the view clean.

### 🎨 3. Native-level UI & Adaptive Themes
The UI design closely adheres to Google's Material Design, making it feel like a native feature:
- **Auto Light/Dark Theme**: Injects CSS variables that perceive `body.dark-theme`, seamlessly adapting theme colors, hover states, and input backgrounds.
- **Precision Flow Control**: Fixes the misaligned native "Select all" button, ensuring the logical flow follows natural top-to-bottom reading habits.
- **Hover-only Actions**: Edit and delete icons for folders, as well as file action triggers, only appear when hovering over the row to maintain a minimalist interface.

### 🔧 4. Deep DOM Takeover & Performance
Beyond simple CSS overrides, the extension reconstructs interaction logic at the base level for reliability:
- **Eliminate !important Conflicts**: Uses high-priority CSS rules to ensure search filtering works across complex DOM structures.
- **Trusted Types Compliance**: Completely avoids `innerHTML`, using safe `createElement` for all DOM nodes to prevent CSP errors.
- **Soft Blocking of Native Elements**: Precisely calculates native list nodes to hide them visually without breaking the underlying Angular interaction chain.

---

## 🚀 Installation Guide

Since it is not yet on the Chrome Web Store, please load it manually via **Developer Mode**:

1. Download or clone this repository:
   ```bash
   git clone https://github.com/MinghuaLiu1977/notebooklm-ext.git
   ```
2. Open a Chromium-based browser (Chrome, Edge, Brave, etc.) and type `chrome://extensions/` in the address bar.
3. Enable **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"** and select the `notebooklm-master-ext` folder.
5. Open [NotebookLM](https://notebooklm.google.com/) to start.

*(Note: If you already have NotebookLM open, you may need to force-refresh `Ctrl/Cmd + Shift + R` after loading the extension.)*

---

## 🛠 Technical Implementation & Evolution

The extension has undergone significant architectural evolution:

- **v3.X - Foundation**: Persistent directory data via localStorage, basic virtual DOM mounting.
- **v4.20~v4.30 - Defensive Refactoring**: Trusted Types support to solve Angular rendering conflicts. Integrated `ResizeObserver` for sidebar monitoring.
- **v4.40~v4.50 - UI Alignment**: Fixed native icon offsets, reconstructed title bar alignment, and introduced adaptive light/dark themes.
- **v4.60-v4.70 - Advanced Actions & Stability**: Unified file action menus (Rename/Delete/Move), hover-only visibility for controls, and dynamic search panel positioning.

---

## ⚖️ Disclaimer

This extension is an independent work created by an individual developer to optimize efficiency. it has no official affiliation, sponsorship, or partnership with Google LLC or NotebookLM. All DOM mounting and interception occur locally and **do not** interfere with or upload your note data.

Since official DOM changes may break the extension, we recommend following this project for the latest updates.

---

## 💡 Contributing

If you have ideas for improving matching algorithms, supporting new layouts, or finding bugs, feel free to submit **Issues** or **Pull Requests**!
