# webarchiveviewer

A from-scratch, browser-based viewer for Apple Safari `.webarchive` files.

## GitHub Pages

https://sspeth000.github.io/webarchiveviewer

## Current stage

This first milestone decodes the property-list container and displays its structure. It supports XML property lists, Apple's `bplist00` binary property lists, Base64 data decoding, and byte-level reading utilities.

No third-party packages, external decoding services, or network requests are used by the decoder. Files are processed locally in the browser.

## Project layout

```
/
├── index.html
├── styles.css
├── app.js
└── src/
    ├── ByteReader.js
    ├── Base64.js
    ├── PlistXML.js
    └── PlistBinary.js
```

Website resource extraction and rendering are intentionally not implemented yet.
