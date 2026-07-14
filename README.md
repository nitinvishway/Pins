# PinVault 📌💾

> A lightweight, local Chrome, Edge & Firefox extension to bulk download Pinterest boards in original high resolution with interactive selection.

---

## ✨ Features

- **Hover Download Button**: Automatically injects a clean download button on Pinterest board cards (near the standard edit button) on profile pages.
- **Glassmorphic Scroller Dashboard**: Slides in on board pages to handle automatic scrolling and dynamic image scanning.
- **Interactive Checkboxes**: Click custom checkboxes on the bottom-left of each Pin card to select or deselect specific items before downloading. Deselected images dim and turn semi-transparent.
- **Original High-Res Extraction**: Automatically fetches original full-resolution source files (bypassing low-resolution thumbnails).
- **Auto-Sorting**: Neatly groups downloads by board name (`Downloads/Pinterest_Downloads/[Board_Name]/`).
- **Throttled & Lightweight**: Uses a 200ms sleep throttle to keep Chrome stable. Runs 100% locally with no ads or tracking.

---

## 🛠️ Installation

### For Google Chrome & Microsoft Edge
1. Clone this repository or download the latest release files.
2. Open Chrome/Edge and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** (top-left) and select the extension folder containing `manifest.json`.

### For Mozilla Firefox
1. Open Firefox and navigate to `about:debugging#/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Select the `manifest.json` file inside the extension folder.

---

## 🔒 Privacy Policy

All operations, scanning, and file downloads are performed entirely within your local browser sandbox. **PinVault** does not collect, store, or transmit any user data or credentials. See [PRIVACY.md](./PRIVACY.md) for full details.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
