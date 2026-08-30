// Shared TanStack Table v9 feature registration for every data table in
// this app (v9's "features" architecture requires declaring up front which
// features/row-models a table uses -- anything not registered here is
// tree-shaken out of the bundle). One shared registration, not one per
// table, so `DataTable`/`DataTablePagination`/`DataTableViewOptions`/
// `DataTableColumnHeader` below can all be typed once against
// `typeof dataTableFeatures` instead of being generic over an arbitrary
// features object every consumer would otherwise have to thread through.
//
// Column sorting/filtering/visibility/pagination/row-selection are the
// baseline every table in this app is expected to want (mirrors the
// shadcn "dashboard-01" block's own feature set) -- a future table with a
// genuinely different need (e.g. row grouping) should add that feature
// here rather than hand-rolling a second, incompatible `tableFeatures()`
// registration, so every table built with this kit stays interchangeable.
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  metaHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  type RowData,
} from "@tanstack/react-table";

/** Extra classes a column can ask `DataTable` to merge onto its own
 * `<TableHead>`/`<TableCell>` -- the shared shell has no other way to take
 * per-column layout opinions (e.g. responsive hiding on narrow viewports,
 * right-alignment for a numeric column) since it only knows how to render
 * whatever `FlexRender` produces for the cell's *content*, not the
 * surrounding table elements themselves. */
export type DataTableColumnMeta = {
  headerClassName?: string;
  cellClassName?: string;
  /** Human-readable name for `DataTableViewOptions`' "Customize columns"
   * dropdown -- falls back to the raw column `id` (e.g. "uptime_7d") when
   * omitted, which reads fine for a table whose column ids already are
   * their display names, but not for one like the overview table's
   * `uptime_7d`/`lastChecked`. */
  label?: string;
};

export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;

/** Pre-binds `dataTableFeatures` so a feature's own column-definition file
 * doesn't need to import/repeat the features object itself -- matches the
 * reference shadcn block's `createColumnHelper<typeof features, TData>()`
 * call, just factored out so every table shares the exact same call. */
export function createDataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}
