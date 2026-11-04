# Belo WMS

Offline Windows program for warehouse stock and parts usage on vehicles: purchase orders, service orders (issue / return), vehicle registry, product master data with shelf locations, fitment catalog, reports, CSV import, USB/SSD backup and PDF service-order forms. The interface is in Georgian.

## How it is built

| Part | Where |
|---|---|
| Desktop shell | Electron 44 (`src/main/main.js`): one window, no menu, no network access |
| Database | SQLite through Node's built-in `node:sqlite` (`src/main/db.js`), no native modules |
| Business rules | `src/main/db.js` — every change is a command run in one transaction |
| Backup / restore | `src/main/backup.js` — full SQLite copy to a folder the user picks |
| Screens | `src/renderer/` (`index.html`, `app.js`, `app.css`, fonts bundled) |
| Bridge | `src/preload.js` — a fixed list of IPC channels |

Rules enforced in the database layer:
- Stock can never go negative (checked in code and by a `CHECK (qty >= 0)` constraint).
- Cost is a weighted average, recalculated on every purchase order.
- Saving a purchase order puts the goods in stock immediately.
- Open service orders close automatically N days (default 7) after their **last change**, and can be reopened.
- The catalog is a recommendation only; it never blocks issuing a part.
- Locations are a managed list per warehouse (free codes such as `A-01-02` or `ZONE-3`); a product can only be placed on an active location from the list. Renaming a location moves its products; only empty locations can be deleted. CSV import adds unknown locations to the list.
- VIN: 17 characters for road vehicles (no I, O, Q); 5–25 characters for machinery serials such as JCB (9, 11, 12, 18, 21…); Latin letters, digits and `-` only; unique.
- Serial numbers are optional on every issue, at most one per unit, and a serial can be on only one vehicle at a time (issued and not returned). Returns record which serials came back.

Data lives in `%APPDATA%\Belo WMS\belo-wms.db`, with logs in `%APPDATA%\Belo WMS\logs\app.log`. Uninstalling does not delete the data.

## Development

```bash
npm install
npm start          # run the app
npm test           # business-rule tests (Node 22.5+)
npm run smoke      # drives the real window through the main flows, screenshots in .smoke/out
```

## Building the Windows installer

```bash
npm run dist:win   # → dist/Belo WMS Setup <version>.exe
```

Before each release, bump `version` in `package.json`. Installing a new Setup.exe over an old one keeps the data. Database changes go in a new entry at the end of `MIGRATIONS` in `src/main/db.js`; never edit an entry that has shipped.

The installer is not code-signed. Windows SmartScreen shows "Windows protected your PC" on first run; click **More info → Run anyway**. A code-signing certificate removes this.

To change the icon, edit `build/icon.svg`, then run `npm run make-icon`.
