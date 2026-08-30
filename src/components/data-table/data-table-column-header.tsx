import type { Column, RowData } from "@tanstack/react-table";

import type { DataTableFeatures } from "./features";

/**
 * Plain-label column header -- every data table in this app renders its
 * headers this way, with no per-column sort affordance (no asc/desc toggle,
 * no chevron icon). Column hiding lives entirely in `DataTableViewOptions`'
 * "Customize columns" dropdown instead of being duplicated per-header, so
 * this component has nothing left to be interactive about; it takes `column`
 * only to keep every existing column-definition callsite unchanged.
 */
export function DataTableColumnHeader<TData extends RowData, TValue>({
  title,
  className,
}: {
  column?: Column<DataTableFeatures, TData, TValue>;
  title: string;
  className?: string;
}) {
  return <div className={className}>{title}</div>;
}
