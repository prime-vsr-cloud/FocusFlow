# FocusFlow Source Code & Build Instructions

This directory contains the original, un-minified source code for FocusFlow.

## Build Instructions

To generate the exact minified code submitted to the Mozilla Add-ons store, please follow these steps:

1. Ensure Python 3 is installed on your system.
2. Open a terminal or command prompt and navigate into this `focusflow-source` directory.
3. Run the following command:
   ```bash
   python build.py
   ```
4. The script will execute and automatically create a `focusflow-firefox` directory (and a `focusflow-dist` directory for Chromium) containing the final, minified extension code.

### Notes on the Build Process
* The `build.py` script does not use complex bundlers like Webpack, Rollup, or Vite.
* It uses basic Regular Expressions to cleanly strip whitespace, newlines, and comments to improve extension performance and load times.
* The code is not obfuscated.

If you have any questions or require further information, please refer to the support email provided in the extension listing. Thank you!
