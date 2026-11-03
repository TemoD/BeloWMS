# Belo WMS — large-data test report

Date: 3 November 2026 · Version: 1.1.1 (1.1.0 plus the fixes below) · Machine: Mac (Apple Silicon); the code is identical on Windows.

## What was tested

Two simulations of daily work, run through the same business-rule code the app uses (`src/main/db.js`), on a real database file:

| | 1 year | 3 years |
|---|---|---|
| Period | 03.11.2025 – 03.11.2026 | 03.11.2023 – 03.11.2026 |
| Products (CSV import) | 3,000 | 3,000 |
| Vehicles (CSV import), 40 models | 600 | 600 |
| Suppliers | 60 | 60 |
| Locations (2 warehouses) | 1,200 | 1,200 |
| Purchase orders / lines | 367 / 2,631 | 1,038 / 7,055 |
| Service orders | 4,797 | 14,191 |
| Issued part lines | 13,307 | 39,636 |
| Services | 4,762 | 14,029 |
| Stock movements | 19,774 | 52,757 |
| Transfers between warehouses | 240 | 783 |
| Successful operations | 27,446 | 80,011 |
| Deliberately invalid operations | 1,005 | 3,001 |
| Database size | 5.1 MB | 12.4 MB |

Each simulated day: 10–20 service orders (fewer on Sundays) with 1–5 parts each, mostly from the vehicle model's own parts. Oils were issued in half-litres. Serial numbers were entered for batteries, tyres, generators and starters, plus occasionally for other parts. Each day also included:
- **Services:** 0–2 per order, half without a price.
- **Order handling:** returns (including picking which serials came back), mileage edits, manual closing, auto-close after 7 days without a change, reopening.
- **Replenishment:** automatic purchase orders whenever stock fell below the minimum.
- **Transfers** between the warehouses.
- **Location housekeeping:** add, rename and delete locations.
- **Catalog learning** every 30 days.

**Invalid operations** were mixed in on purpose:
- issuing more than the stock
- issuing a serial already on another vehicle
- returning more than was issued
- transferring more than the stock
- deleting a location that still holds products
- assigning a location that isn't in the list
- saving an invalid VIN or a duplicate article
- bad CSV rows

**Independent check:** a separate model computed what stock, average cost, order status and spending *should* be, and the database was compared against it at the end.

## Results: data correctness

| Check | 1 year | 3 years |
|---|---|---|
| Crashes | 0 | 0 |
| Valid operations wrongly refused | 0 | 0 |
| Invalid operations wrongly accepted | 0 (1,005 refused) | 0 (3,001 refused) |
| Stock differences (3,000 products × 2 warehouses) | 0 | 0 |
| Average-cost differences | 0 | 0 |
| Negative stock | 0 | 0 |
| Service-order status differences (incl. auto-close) | 0 | 0 |
| Open orders past their auto-close date | 0 | 0 |
| A serial on two vehicles at once | 0 | 0 |
| Total spending, report vs. independent model | 7,123,281.51 ₾ = 7,123,281.51 ₾ | 20,488,943.28 ₾ = 20,488,943.28 ₾ |
| CSV import (3,000 products): values exactly as in the file | yes, 4 bad rows rejected, 200 new locations created | yes |
| Renaming a location moved its products | yes | yes |
| SQLite integrity check / foreign keys | ok / 0 errors | ok / 0 errors |
| Backup → change → restore returns the exact data | yes | yes |

## Results: speed

Database operations, per action (average / slowest 5%):

| Action | 1 year | 3 years |
|---|---|---|
| Issue a part | 0.13 / 0.39 ms | 0.24 / 1.2 ms |
| Open a service order | 0.31 / 0.56 ms | 0.56 / 0.94 ms |
| Purchase order (avg. 7 lines) | 0.53 / 1.1 ms | 0.70 / 1.2 ms |
| Return | 0.12 / 0.17 ms | 0.17 / 0.23 ms |
| CSV import of 3,000 products (check + save) | 0.03 s + 0.77 s | 0.03 s + 0.80 s |
| CSV import of 600 vehicles | 0.03 s | 0.03 s |
| Backup to USB folder (incl. verification) | 0.03 s | 0.07 s |
| Restore | 0.03 s | 0.09 s |

The real app window (Electron), measured on the same databases:

| Screen / action | 1 year | 3 years |
|---|---|---|
| Start-up (load all data + first screen) | 0.09 s | 0.20 s |
| Dashboard | 16 ms | 26 ms |
| Service orders list | 30 ms | 37 ms |
| Service order | 22 ms | 30 ms |
| Products / search keystroke | 30 / 28 ms | 31 / 31 ms |
| Locations | 22 ms | 26 ms |
| Vehicles | 30 ms | 47 ms |
| Catalog, all 40 models | 65 ms | 66 ms |
| Reports: vehicle costs / stock / moves | 62 / 30 / 21 ms | 66 / 33 / 24 ms |
| Global search keystroke (incl. serials) | 3 ms | 5 ms |
| **Click that saves** (issue part, add service, purchase order) | **39–45 ms** | **55–62 ms** |
| PDF of a service order | 0.10 s | 0.11 s |
| Screen memory | 25 MB | 21 MB |
| Screen errors | 0 | 0 |

Everything is under 0.1 s, which feels instant, except start-up, which is 0.2 s at 3 years.

## Problems found and fixed

| Problem (before the fix) | Cause | Fix | After |
|---|---|---|---|
| **Catalog screen froze** with real data (over 20 s, never finished) | The usage history was recalculated for every product × model cell | History is computed once per update; search box and paging added | 65 ms |
| Service-order list 0.62 s, products 0.42 s, locations 0.15 s | All 4,797 / 3,000 / 1,200 rows drawn at once; slow lookups | First 200 rows plus a "მეტის ჩვენება" (show more) button (search still covers everything); instant lookups by id and by location | 30 ms, 30 ms, 22 ms |
| Every click got slower as data grew: 0.10 s at 1 year, 0.25 s at 3 years | After each change the whole database (8 MB at 3 years) was rebuilt and sent to the screen | Service orders are cached; only the orders a click changed are rebuilt and sent; correctness checked against a full reload over 3,637 updates | 0.04 s, 0.06 s |
| Catalog product names scrolled out of view with 40 models | — | Product column stays pinned | — |

## Not covered by this test
- Windows itself: the timings are from a Mac, and an older Windows PC will be somewhat slower. The database code and the app are the same.
- A USB stick that is pulled out during a backup.
- Several people working at the same time: the program is single-user by design.

## How to repeat

```bash
node test/load.js .load                    # 1 year, report in .load/report.json
LOAD_YEARS=3 node test/load.js .load3      # 3 years
BELO_PERF=1 BELO_DATA=<folder with belo-wms.db> BELO_OUT=.perf npx electron .   # screen timings
```
