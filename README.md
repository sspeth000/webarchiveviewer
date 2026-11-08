# webarchiveviewer

A from-scratch, browser-based viewer for Apple Safari `.webarchive` files.

## GitHub Pages

https://sspeth000.github.io/webarchiveviewer

## Current stage

The app decodes XML and Apple's `bplist00` binary property lists, then recursively extracts raw `WebResourceData` from the main archive, subresources, and nested subframe archives. Extracted resources are listed with their URL, MIME type, size, and a suggested path, and can be downloaded individually.

The decoder and extractor use browser-native JavaScript and process files locally. No third-party packages or external decoding services are used.

Website reconstruction/rendering and ZIP export are not implemented yet.

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
    ├── PlistBinary.js
    └── ResourceExtractor.js
```
