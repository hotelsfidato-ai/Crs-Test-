← [Index](README.md) · Related: [V — Component reference](05-component-reference.md)

---

# Appendix B — Complete component props reference

Every exported component, every prop. Volume V explains the *design*; this is the lookup.

**Legend** — `R` required · default in `code`

---

## B.1 `Button.tsx`

### `Button`

| Prop | Type | Default | |
|---|---|---|---|
| `variant` | `"primary" \| "secondary" \| "ghost" \| "danger" \| "link"` | `secondary` | |
| `size` | `"sm" \| "md" \| "lg" \| "icon"` | `md` | |
| `loading` | `boolean` | `false` | Spinner replaces `leadingIcon`; disables |
| `asChild` | `boolean` | `false` | Renders the child (router `Link`) |
| `leadingIcon` | `ReactNode` | — | |
| `trailingIcon` | `ReactNode` | — | Suppressed while loading |
| `className` | `string` | — | Merged via `tailwind-merge` |
| *…native* | `ButtonHTMLAttributes` | — | |

⚠️ With `asChild`, `disabled` is **not** forwarded — invalid on an anchor.

---

## B.2 `Input.tsx`

### `Field`

| Prop | Type | | |
|---|---|---|---|
| `label` | `ReactNode` | R | |
| `children` | `(args) => ReactNode` | R | Render prop |
| `required` | `boolean` | | Adds marker + `aria-required` |
| `hint` | `ReactNode` | | Replaced by `error` when present |
| `error` | `string` | | Sets `aria-invalid` |
| `className` | `string` | | |

Render-prop args: `{ id: string; describedBy: string \| undefined; invalid: boolean }`

### `Input`

| Prop | Type | | |
|---|---|---|---|
| `invalid` | `boolean` | | Red border + ring |
| `numeric` | `boolean` | | Applies `.tabular` |
| `leadingIcon` | `ReactNode` | | Inside the field, left |
| *…native* | `InputHTMLAttributes` | | |

### `Textarea`

`invalid` · plus native `TextareaHTMLAttributes`. Default `rows={3}`.

### `NativeSelect`

`invalid` · plus native `SelectHTMLAttributes`. Renders its own chevron.

---

## B.3 `Combobox.tsx`

| Prop | Type | | |
|---|---|---|---|
| `value` | `string` | R | |
| `onChange` | `(value: string) => void` | R | |
| `options` | `ComboboxOption[]` | R | |
| `placeholder` | `string` | | Shown when nothing selected |
| `searchPlaceholder` | `string` | | Also the search input's `aria-label` |
| `emptyMessage` | `string` | | Shown when the filter matches nothing |
| `footer` | `ReactNode` | | Below the list — e.g. "Create a new customer" |
| `disabled` / `invalid` | `boolean` | | |
| `id` / `className` | `string` | | |

`ComboboxOption`: `{ value: string; label: string; description?: string; disabled?: boolean }`

Filters on label **and** description; caps at 100 rendered results.

---

## B.4 `DatePicker.tsx`

### `DateRangePicker`

| Prop | Type | | |
|---|---|---|---|
| `from` / `to` | `string \| undefined` | R | ISO dates |
| `onChange` | `(range: { from?: string; to?: string }) => void` | R | |
| `minDate` / `maxDate` | `Date` | | |
| `id` / `className` | `string` | | |

---

## B.5 `DataTable.tsx`

### `DataTable<T>`

| Prop | Type | Default | |
|---|---|---|---|
| `columns` | `Column<T>[]` | R | |
| `rows` | `T[]` | R | |
| `rowKey` | `(row: T) => string` | R | |
| `loading` | `boolean` | | → `SkeletonTable` |
| `error` | `unknown` | | → `ErrorState` |
| `onRetry` | `() => void` | | |
| `onRowClick` | `(row: T) => void` | | Makes rows focusable + Enter-activated |
| `sortBy` | `string` | | |
| `sortDir` | `"asc" \| "desc"` | | |
| `onSort` | `(key: string) => void` | | Enables sort buttons |
| `empty` | `ReactNode` | | Shown when the dataset is empty |
| `hasFilters` | `boolean` | | ⚠️ Switches empty → no-results |
| `onClearFilters` | `() => void` | | |
| `stickyHeader` | `boolean` | `true` | |
| `className` | `string` | | |

### `Column<T>`

| Prop | Type | | |
|---|---|---|---|
| `key` | `string` | R | Also the sort key |
| `header` | `ReactNode` | R | |
| `cell` | `(row: T, index: number) => ReactNode` | R | |
| `numeric` | `boolean` | | Right-align + `data-numeric` |
| `sortable` | `boolean` | | Needs `onSort` |
| `width` | `string` | | Tailwind width utility |
| `hideBelow` | `"sm" \| "md" \| "lg" \| "xl"` | | Responsive dropping |
| `className` | `string` | | |

### `Pagination`

`page` R · `pageSize` R · `total` R · `onPageChange` R · `className`

Returns `null` when `total === 0`.

---

## B.6 `FilterBar.tsx`

| Prop | Type | | |
|---|---|---|---|
| `search` | `string` | R | |
| `onSearchChange` | `(value: string) => void` | R | |
| `searchPlaceholder` | `string` | | |
| `filters` | `FilterDef[]` | | |
| `values` | `Record<string, string>` | | |
| `onFilterChange` | `(key: string, value: string) => void` | | |
| `onClear` | `() => void` | | |

`FilterDef`: `{ key: string; label: string; options: { value: string; label: string }[] }`

⚠️ `"all"` is treated as *no filter* by `applyFilters`.

---

## B.7 `Card.tsx`

| Component | Props |
|---|---|
| `Card` | `className` + native div attributes |
| `CardHeader` | `title?: ReactNode` · `description?: ReactNode` · `actions?: ReactNode` |
| `CardBody` | `className` + native |
| `CardFooter` | `className` + native. Right-aligned action row |

⚠️ `CardHeaderProps` uses `Omit<HTMLAttributes<HTMLDivElement>, "title">` so `title` can be a
`ReactNode` rather than the native `string`.

---

## B.8 `PageHeader.tsx`

### `Page`

`children` R · `className`. Applies `px-5 py-6 sm:px-7 sm:py-8 max-w-[1600px] mx-auto`.

### `PageHeader`

| Prop | Type | | |
|---|---|---|---|
| `title` | `ReactNode` | R | |
| `description` | `ReactNode` | | |
| `breadcrumbs` | `{ label: string; to?: string }[]` | | Last entry is the current page |
| `badge` | `ReactNode` | | Beside the title |
| `actions` | `ReactNode` | | Right-aligned; wraps on narrow |
| `children` | `ReactNode` | | Filter row below the header |

### `Section`

`title?` · `description?` · `actions?` · `children` R · `className`

---

## B.9 `StatusPill.tsx`

| Prop | Type | Default | |
|---|---|---|---|
| `tone` | `Tone` | `neutral` | 6 values |
| `children` | `ReactNode` | R | |
| `dot` | `boolean` | `true` | Set `false` for categorical labels |
| `className` | `string` | | |

`Tone` = `success` · `warning` · `danger` · `info` · `accent` · `neutral`

### Exported tone maps

`RESERVATION_TONES` · `INVOICE_TONES` · `HOTEL_TONES` · `CUSTOMER_TONES` · `COMPANY_TONES` ·
`AUTOMATION_TONES` · `RUN_TONES` · `COMMISSION_TONES` · `INTEGRATION_TONES`

All `Record<string, Tone>`. Always use with a fallback:

```tsx
<StatusPill tone={RESERVATION_TONES[r.status] ?? "neutral"}>
```

---

## B.10 `States.tsx`

| Component | Props |
|---|---|
| `EmptyState` | `title` R · `description?` · `icon?` · `action?` · `compact?` |
| `NoResultsState` | `onClear?` · `title?` · `description?` |
| `ErrorState` | `onRetry?` · `title?` · `description?` |
| `Skeleton` | `className` — set width and height |
| `SkeletonTable` | `columns: number` R · `rows?` (default 8) |
| `SkeletonCards` | `count: number` R |

⚠️ Skeletons must match the height of the content they replace, or the layout jumps.

---

## B.11 `Overlays.tsx`

### Dialog

| Export | Notes |
|---|---|
| `Dialog` | Radix `Root` |
| `DialogTrigger` | Use with `asChild` |
| `DialogClose` | Use with `asChild` |
| `DialogContent` | `title` R · `description?` · `children` R · `footer?` · `size?` · `className?` |

`size`: `sm` 420 · `md` 560 (default) · `lg` 760 · `xl` 980 px

### DropdownMenu

`DropdownMenu` · `DropdownMenuTrigger` · `DropdownMenuContent` (`align?` `sideOffset?`) ·
`DropdownMenuItem` (`onSelect?` `disabled?` `danger?` `icon?`) · `DropdownMenuSeparator` ·
`DropdownMenuLabel`

⚠️ Opens on `pointerdown`, not `click`.

### Tooltip

`TooltipProvider` (`delayDuration?`, app-wide `400`) · `Tooltip` (`content` R · `children` R ·
`side?`)

⚠️ Wrap a **disabled** trigger in a `<span>` — disabled elements emit no pointer events.

### Tabs

`Tabs` (`defaultValue` R) · `TabsList` · `TabsTrigger` (`value` R · `count?`) · `TabsContent`
(`value` R)

`count` renders a subtle badge, used for row counts.

---

## B.12 `Toast.tsx`

```ts
toast.success(title: string, body?: string): void
toast.warning(title: string, body?: string): void
toast.error(title: string, body?: string): void
toast.info(title: string, body?: string): void
```

`<Toaster />` is mounted once in `AppShell`. Bottom-right; 5 s (7 s for errors); max 3 stacked.

---

## B.13 `Misc.tsx`

| Component | Props |
|---|---|
| `Avatar` | `name` R · `color?` · `size?` (`xs` 20 · `sm` 24 · `md` 32 · `lg` 40 px) |
| `StarRating` | `value` R (1–5) · `className?` |
| `ProgressBar` | `value` R (0–100) · `tone?` (`accent` \| `success` \| `warning` \| `danger`) · `className?` |
| `Segmented<T>` | `value` R · `onChange` R · `options` R (`{ value, label }[]`) · `className?` |
| `Stat` | `label` R · `value` R · `hint?` |
| `DetailList` | `children` R — renders a `<dl>` |
| `DetailRow` | `label` R · `children` R |
| `Checkbox` | `label?` · `checked` R · `onCheckedChange` R · `disabled?` |
| `Switch` | `checked` R · `onCheckedChange` R · `aria-label` R · `disabled?` |

⚠️ **Checkbox vs Switch.** Switch = takes effect immediately, no save. Checkbox = a form value,
takes effect on submit. Using a Switch in a form implies a save that never happens.

---

## B.14 App-level components

| Component | Props | Notes |
|---|---|---|
| `AppShell` | — | Renders `<Outlet/>`; owns the scroll-lock guard |
| `Sidebar` | `onNavigate?` | Passed by the mobile drawer to close on navigate |
| `TopBar` | — | Search, actions, notifications, role switcher |
| `RoleSwitcher` | — | Reads and writes `useSession` |
| `CommandPalette` | — | ⌘K; closes before navigating |
| `AiPanel` | — | Right drawer |

---

## B.15 Hooks

### `useListState(options?)`

```ts
{
  filterKeys?: string[];        // ⚠️ must declare every filter key
  defaultSortBy?: string;
  defaultSortDir?: "asc" | "desc";   // default "desc"
  pageSize?: number;                  // default 25
}
```

Returns:

| Member | Type | |
|---|---|---|
| `search` | `string` | Mirrored for instant typing |
| `setSearch` | `(value: string) => void` | |
| `filters` | `Record<string, string>` | |
| `setFilter` | `(key: string, value: string) => void` | |
| `sortBy` | `string \| undefined` | |
| `sortDir` | `"asc" \| "desc"` | |
| `toggleSort` | `(key: string) => void` | |
| `page` / `setPage` | | |
| `clear` | `() => void` | |
| `hasFilters` | `boolean` | Drives the no-results state |
| `query` | `ListQuery` | Pass to the repository **and** the query key |

### Session hooks

| Hook | Returns |
|---|---|
| `useSession(selector)` | Zustand selector over `{ role, setRole }` |
| `useCurrentUser()` | The `User` for the current role |
| `useScope()` | `{ role, userId, hotelId? }` for repository calls |
| `useActor()` | `{ id, name, role }` for writes |
| `useUi(selector)` | Sidebar, mobile nav, palette, AI panel |

---

## B.16 Library functions

### `src/lib/format.ts`

| Function | Example |
|---|---|
| `money(v)` | `₹1,20,000` |
| `moneyPrecise(v)` | `₹1,20,000.00` |
| `moneyCompact(v)` | `₹1.2L` · `₹4.6Cr` |
| `number(v)` | `1,20,000` |
| `percent(v, digits = 1)` | `61.0%` |
| `delta(v, digits = 1)` | `+12.4%` · `−3.1%` |
| `dateShort(v)` | `28 Jul 2026` |
| `dateCompact(v)` | `28 Jul` |
| `dateLong(v)` | `Tuesday, 28 July 2026` |
| `dateTime(v)` | `28 Jul 2026, 3:45 PM` |
| `timeOnly(v)` | `3:45 PM` |
| `relative(v)` | `14 days ago` |
| `nights(in, out)` | `3` |
| `nightsLabel(in, out)` | `3 nights` |
| `isoDate(date)` | `2026-07-28` |
| `initials(name)` | `AB` |
| `truncate(v, max)` | `Turtle Beach…` |
| `phone(v)` | `+91 98765 43210` |
| `humanise(v)` | `pending_approval` → `Pending Approval` |

### `src/lib/permissions.ts`

`can(role, action, resource)` · `canAccess(role, resource)` · `grantsFor(role, resource)` ·
`permissionMatrix()` · `scopeRecords(ctx, records)` ·
`ROLES` `RESOURCES` `ACTIONS` `ROLE_LABELS` `ROLE_DESCRIPTIONS` `RESOURCE_LABELS` `ACTION_LABELS`

### `src/lib/rules.ts`

`APPROVAL_THRESHOLD` · `BUSINESS_RULES` · `isTerminal(status)` ·
`canCancelReservation(role, r)` · `canEditReservation(role, r)` · `canEditRates(role)` ·
`requiresApproval(total)` · `canApproveReservation(role)` · `labelFor(status)` ·
`nextStatuses(current)` · `isDuplicateEmail(email, existing, ignoreId?)` ·
`isDuplicatePhone(phone, existing, ignoreId?)`

---

← [Index](README.md)
