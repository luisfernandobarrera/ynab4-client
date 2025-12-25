# YNAB4 Client

A modern, cross-platform client for YNAB4 budgets with full read/write support.

## Tech Stack

- **Framework**: SvelteKit + TypeScript
- **UI Components**: shadcn-svelte
- **Styling**: Tailwind CSS
- **Tables**: TanStack Table
- **Charts**: Chart.js / Recharts
- **Desktop/Mobile**: Tauri 2.0
- **Budget Logic**: ynab-library

## Features

- Full YNAB4 file format compatibility (read/write)
- Dropbox sync (like original YNAB4)
- Responsive tables → cards on mobile
- MSI (Meses Sin Intereses) support
- Context menus with bulk actions
- Scheduled transactions with auto-entry
- 5 report types with charts

## Platforms

| Platform | Status |
|----------|--------|
| Web | 🚧 In Progress |
| Android | 📋 Planned |
| iOS | 📋 Planned |
| macOS | 📋 Planned |
| Windows | 📋 Planned |
| Linux | 📋 Planned |

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Run Tauri desktop
npm run tauri:dev

# Build Android APK
npm run tauri:android:build
```

## Project Structure

```
ynab4-client/
├── src/
│   ├── lib/
│   │   ├── components/     # shadcn + custom components
│   │   │   ├── ui/         # shadcn-svelte components
│   │   │   ├── layout/     # App shell, sidebar, header
│   │   │   ├── transactions/
│   │   │   ├── budget/
│   │   │   └── import/
│   │   ├── stores/         # Svelte stores
│   │   ├── utils/          # Utilities
│   │   └── i18n/           # Translations
│   ├── routes/             # SvelteKit routes
│   └── app.html
├── src-tauri/              # Tauri config
├── static/                 # Static assets
└── tailwind.config.js
```

## Fonts

| Use | Font | Weight |
|-----|------|--------|
| Titles | Urbanist | 600-700 |
| UI | Plus Jakarta Sans | 400-600 |
| Numbers | Inter (tabular) | 400-600 |

## License

MIT
