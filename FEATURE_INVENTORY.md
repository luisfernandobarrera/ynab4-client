# YNAB4-Client vs YNAB4-Viewer Feature Inventory

## Feature Comparison Status

### ✅ Implemented Features

#### Welcome Screen
- [x] Budget list (Dropbox)
- [x] Budget list (Local - Tauri only)
- [x] Create new budget
- [x] Dropbox OAuth flow
- [x] Language switcher
- [x] Theme toggle (light/dark)
- [x] Settings modal

#### Navigation
- [x] Sidebar with menu items
- [x] Mobile responsive layout
- [x] Hamburger menu
- [x] Active view highlighting

#### Transactions View
- [x] Transaction table with columns (flag, date, account, payee, category, memo, outflow, inflow, balance, status)
- [x] Account filter panel
- [x] Date navigation (YNAB4-style year/month selector)
- [x] Sort by date (asc/desc)
- [x] Infinite scroll loading
- [x] Split transaction expansion
- [x] Flag display (colored bar)
- [x] Status display (cleared/reconciled bar)
- [x] Transfer icon indicator
- [x] Missing category indicator
- [x] Needs approval indicator
- [x] Inline transaction entry (edit mode)
- [x] Inline transaction editing
- [x] Payee autocomplete
- [x] Category autocomplete
- [x] Column visibility toggle
- [x] Search/filter

#### Budget View
- [x] Monthly budget grid
- [x] Master category collapsing
- [x] Budgeted/Activity/Available columns
- [x] Category transactions panel
- [x] Budget amount editing (edit mode)
- [x] Multi-month navigation
- [x] Active categories filter

#### Cash Flow View
- [x] All/Checking/Savings filter
- [x] Account panel with balances
- [x] Transaction table
- [x] Income/Expense/Transfer categorization
- [x] Summary stats (initial, income, expenses, final)
- [x] Date navigation

#### Reconciliation View
- [x] Account status overview
- [x] Cleared/Uncleared/Working balances
- [x] Days since reconciliation
- [x] Account grouping by type
- [x] Basic reconciliation wizard

#### Scheduled Transactions
- [x] List of scheduled transactions
- [x] Overdue/Upcoming sections
- [x] Frequency display
- [x] Enter/Skip actions

#### Payees View
- [x] Payee list with transaction count
- [x] Payee details
- [x] Rename payee (edit mode)
- [x] Search payees

#### Create Account
- [x] Account type selection
- [x] On/Off budget toggle
- [x] Starting balance
- [x] Account creation (edit mode)

#### Reports
- [x] Spending by Category chart
- [x] Basic report structure

#### Edit Mode System
- [x] Global edit mode toggle
- [x] Read-only indicator
- [x] Dirty/unsaved changes tracking
- [x] Change count badge
- [x] Warning modal before enabling

#### Sync (Write Mode)
- [x] Device GUID generation
- [x] Device registration
- [x] Ydiff file creation
- [x] Push changes to Dropbox
- [x] Knowledge tracking

#### i18n
- [x] English (en)
- [x] Spanish (es)

---

### ❌ Missing Features (from YNAB4-Viewer)

#### Transactions
- [ ] **Check number column** - Display and edit check numbers
- [ ] **Full inline cell editing** - Click any cell to edit directly
- [ ] **Flag picker popup** - Click flag column to see color picker
- [ ] **Column resizing** - Drag to resize columns (partially working)
- [ ] **Mobile transaction editor** - Full-screen editor sheet
- [ ] **Transaction delete** - Delete transactions

#### Reconciliation
- [ ] **Interactive reconciliation mode** - Step-by-step wizard with:
  - Clear/unclear individual transactions
  - Running difference calculation
  - Auto-adjustment creation
  - Mark all as reconciled
- [ ] **Statement date/balance entry form**

#### Reports
- [ ] **Spending by Payee** - Bar chart by payee
- [ ] **Spending Trends** - Line chart over time
- [ ] **Net Worth** - Assets vs Liabilities chart
- [ ] **Income vs Expense** - Comparison chart
- [ ] **Date range presets** - This month, Last month, etc.

#### CSV Import
- [ ] **CSV Import View** - Complete feature:
  - Drag & drop file upload
  - Date format detection
  - Column mapping
  - Transaction preview
  - Duplicate detection
  - Import confirmation

#### Cash Flow
- [ ] **View mode tabs** - Summary/Expenses/Credit Cards/Cash/From Savings
- [ ] **Better transaction categorization badges**

#### Scheduled Transactions
- [ ] **Create scheduled transaction**
- [ ] **Edit scheduled transaction**
- [ ] **Delete scheduled transaction**
- [ ] **Auto-enter when due**

#### Payees
- [ ] **Combine payees** - Merge multiple payees
- [ ] **Auto-category rules** - Set default category for payee
- [ ] **Rename rules** - Regex-based payee renaming

#### Accounts
- [ ] **Edit account** - Change account name, type, on/off budget
- [ ] **Close account** - Mark as closed
- [ ] **Delete account** - With transaction handling
- [ ] **Account ordering** - Custom sort order

#### General
- [ ] **Keyboard shortcuts** - Navigate with keyboard
- [ ] **Undo/Redo** - Track and revert changes
- [ ] **Export to CSV** - Download transactions
- [ ] **Full mobile optimization** - Card-based transactions on mobile
- [ ] **Light mode** - Currently dark mode only works well

---

### 🔧 Known Issues

1. **Flag colors not showing** - `flagColor` vs `flag` property mapping issue
2. **Editor layout breaks** - Edit row styling needs work
3. **Column resizing** - Not fully functional
4. **Cash Flow debit account colors** - Negative amounts showing incorrectly
5. **Date format inconsistency** - Editor vs table display

---

### 📊 Feature Coverage

| Category | Viewer | Client | Coverage |
|----------|--------|--------|----------|
| Transactions | 15 | 12 | 80% |
| Budget | 8 | 7 | 88% |
| Cash Flow | 10 | 7 | 70% |
| Reconciliation | 8 | 4 | 50% |
| Reports | 6 | 2 | 33% |
| Scheduled | 5 | 2 | 40% |
| Payees | 5 | 2 | 40% |
| Accounts | 5 | 2 | 40% |
| Import | 6 | 0 | 0% |
| **Total** | **68** | **38** | **56%** |

---

### 🎯 Priority Features for Next Sprint

1. **CSV Import** - Critical for data entry
2. **Full Reconciliation Mode** - Essential for account management
3. **More Reports** - User requested
4. **Flag picker/column editing** - Better UX
5. **Mobile optimization** - Card layout for transactions

---

*Last updated: December 26, 2025*

