# Container Manufacturing Management System

A browser-based workshop management application built with **React** and **Vite**. The application provides a Persian, right-to-left (RTL) interface to support daily operations in a container manufacturing workshop.

This is a portfolio/educational project based on a practical workshop-management use case, **not a production-ready multi-user ERP system**.

## Features

- **Dashboard:** operational and financial summaries.
- **Orders and customers:** manage customer information, orders, and order status.
- **Containers and production models:** track container units, types, and templates.
- **Inventory and purchases:** manage materials, stock changes, and purchases.
- **Finance:** track income, expenses, payments, and checks.
- **Workers:** manage workers and wage records.
- **Reports:** visualize statistics and export/print reports.
- **Settings:** theme options, browser-local account settings, JSON backup/restore, and CSV summary export.
- **Localization:** Persian interface, RTL layout, and Jalali date input.

## Technology

React 18, JavaScript (JSX), Vite 5, CSS, Recharts, Lucide React, and React Multi Date Picker.

## Getting started

**Requirements:** Node.js 18 or newer and npm.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite (typically `http://localhost:5173`).

**Initial demo login:**

- Username: `admin`
- Password: `1234`

The demo login is entirely client-side. It is **not secure authentication**; do not treat these credentials or the UI login screen as access control for sensitive information. The default demo credentials can be changed in the Settings UI, but credentials are still kept in browser storage.

### Other commands

```bash
npm run build     # Build into dist/
npm run preview   # Preview the production build locally
npm test          # Run unit tests for utility functions
```

## Project structure

```text
src/
  components/    # Dashboard, orders, finance, inventory, reporting, etc.
  utils/         # Accounting, inventory updates, audit helpers
  App.jsx        # App shell, navigation, state persistence
  App.css        # Application styling
  main.jsx       # React entry point
public/          # Static assets
```

## Data storage and limitations

- Records are saved in the current browser's **localStorage** (key: `gm-data`), not in a database or remote server.
- Login state and credentials are also stored locally (`gm-auth`, `gm-auth-config`). **There is no server-side authentication, role-based access control, or synchronization across users/devices.**
- Data can be lost if browser storage is cleared. JSON backup/restore is available through Settings; backups may contain sensitive business information and should not be committed to GitHub.
- The backup export omits account credentials. Restoring older backup files may still restore included local account settings.
- Do not expose this version as a public internet-facing service for real financial or customer data. A backend, database, and secure authentication would be needed for production use.

## Notes for contributors

The repository intentionally excludes `node_modules/`, generated `dist/` files, local Git history, and archived Create React App scaffolding. Use `npm ci` to install dependencies from the committed lockfile.

## License

No open-source license has been granted. Contact the repository owner before copying, modifying, or redistributing this project.
