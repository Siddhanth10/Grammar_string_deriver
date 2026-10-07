# Grammar String Deriver

> Validate CFG strings and visualize derivation trees using BFS and DFS.

<p align="center">
  <a href="https://grammar-string-deriver.onrender.com/">
    <img src="https://img.shields.io/badge/🌐%20Open%20Website-Grammar%20String%20Deriver-6c63ff?style=for-the-badge" alt="Open Website">
  </a>
  <a href="https://github.com/Siddhanth10/Grammar_string_deriver/releases/download/desktop-latest/Grammar.String.Deriver.Setup.1.0.1.exe">
    <img src="https://img.shields.io/badge/🪟%20Install%20Windows%20App-Download%20EXE-00b894?style=for-the-badge" alt="Install Windows App">
  </a>
</p>

<p align="center">
  <a href="https://github.com/Siddhanth10/Grammar_string_deriver/releases/tag/desktop-latest">Windows Releases</a>
  ·
  <a href="https://grammar-string-deriver.onrender.com/">Live Website</a>
</p>

## About

Grammar String Deriver is a web-based tool for working with Context-Free Grammars (CFGs). It lets you enter production rules, validate target strings, and visualize derivation trees using different derivation strategies.

## Features

- CFG production rule input
- CFG grammar validation
- Target string / terminal-symbol validation
- BFS derivation
- DFS derivation
- Derivation tree visualization
- Multiple successful derivations
- Responsive web interface
- PWA support for mobile installation
- Windows desktop application

## How to Use

1. Open the **[website](https://grammar-string-deriver.onrender.com/)**.
2. Enter the CFG production rules.
3. Select or enter the start symbol.
4. Enter the target string.
5. Use **Validate String** to check whether all target symbols belong to the grammar's terminal alphabet.
6. Run the derivation using BFS or DFS.
7. View the resulting derivation tree.

## Windows Application

You can use Grammar String Deriver as a dedicated Windows desktop application.

**[⬇️ Download Grammar String Deriver for Windows](https://github.com/Siddhanth10/Grammar_string_deriver/releases/download/desktop-latest/Grammar.String.Deriver.Setup.1.0.1.exe)**

Or visit the **[Windows release page](https://github.com/Siddhanth10/Grammar_string_deriver/releases/tag/desktop-latest)**.

## Project Structure

- `app.py` — Flask server used for deployment.
- `index.html` — Main application interface.
- `app.js` — Application logic and UI interactions.
- `grammar.js` — CFG parsing, validation, and derivation algorithms.
- `tree-renderer.js` — Derivation tree rendering.
- `style.css` — Application styling.
- `manifest.json` — PWA configuration.
- `service-worker.js` — PWA caching and offline support.
- `electron/main.js` — Windows desktop application wrapper.
- `.github/workflows/build-windows.yml` — Automated Windows installer build.

## Technology Stack

- HTML
- CSS
- JavaScript
- Flask
- Python
- Electron
- GitHub Actions

## Links

- **Website:** https://grammar-string-deriver.onrender.com/
- **Source Code:** https://github.com/Siddhanth10/Grammar_string_deriver
- **Windows App:** https://github.com/Siddhanth10/Grammar_string_deriver/releases/tag/desktop-latest

## License

This project is provided for educational and academic use.
