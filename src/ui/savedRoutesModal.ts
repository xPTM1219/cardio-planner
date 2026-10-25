import {
  FormatModule,
  InteractionModule,
  ResizeTableModule,
  SortModule,
  Tabulator,
} from 'tabulator-tables';
import type { CellComponent, RowComponent } from 'tabulator-tables';
import { t } from '../i18n';
import type { Route } from '../types';
import { escapeHtml, formatDuration } from '../utils/format';
import { SavedRouteRow, SavedRouteRowOptions, toSavedRouteRows } from '../utils/savedRoutes';
import { unitLabels } from '../utils/speeds';
import { Modal } from './modal';

// Only the Tabulator modules that the table uses are loaded.
Tabulator.registerModule([FormatModule, SortModule, InteractionModule, ResizeTableModule]);

/** Options for {@link openSavedRoutesModal}. */
export interface SavedRoutesModalOptions {
  /** Stored routes, possibly with corrupt entries (they are not shown). */
  routes: Route[];
  /** Units, language, and speed for the table values. */
  rowOptions: SavedRouteRowOptions;
  /** Loads a route on the map. Called after the modal closes. */
  onLoad: (route: Route) => void | Promise<void>;
  /**
   * Deletes a stored route.
   * @returns `true` when the route was deleted.
   */
  onDelete: (route: Route) => Promise<boolean>;
}

/**
 * Make a small button for the actions column.
 * @param label Visible text.
 * @param className CSS classes.
 * @param onClick Click handler.
 * @returns The button element.
 */
function actionButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return button;
}

/**
 * Open the Saved Routes modal with a sortable Tabulator table.
 *
 * [1] Tabulator measures its container, so the table is built after the
 *     dialog is visible. The table is destroyed when the modal closes.
 * [2] Text cells from formatters are inserted as HTML, so they are escaped.
 *     The name column uses the "plaintext" formatter, which also escapes.
 * [3] A double-click on a row loads the route, but not a double-click on
 *     the action buttons.
 * [4] Long translated column titles wrap. They are not cut off in narrow
 *     windows.
 *
 * @param options Routes, display settings, and callbacks.
 * @returns The open modal.
 */
export function openSavedRoutesModal(options: SavedRoutesModalOptions): Modal {
  const routesById = new Map<string, Route>();
  for (const route of options.routes) {
    if (route && typeof route.id === 'string') {
      routesById.set(route.id, route);
    }
  }
  const rows = toSavedRouteRows(options.routes, options.rowOptions);
  let table: Tabulator | null = null;

  const modal = new Modal({
    id: 'saved-routes-modal',
    title: t('savedRoutesModalTitle'),
    bodyHtml: '<div class="saved-routes-table"></div>',
    footerHtml: `<button type="button" class="btn btn-secondary" data-modal-close>${escapeHtml(t('closeButton'))}</button>`,
    className: 'modal-wide',
    onClose: () => {
      table?.destroy();
      table = null;
    },
  });

  const loadRoute = (id: string): void => {
    const route = routesById.get(id);
    if (!route) return;
    modal.close();
    void options.onLoad(route);
  };

  const deleteRoute = async (id: string, row: RowComponent): Promise<void> => {
    const route = routesById.get(id);
    if (!route) return;
    const name = (row.getData() as SavedRouteRow).name;
    if (!window.confirm(t('confirmDeleteRoute', { name }))) return;
    if (await options.onDelete(route)) {
      routesById.delete(id);
      await row.delete();
    }
  };

  const actionsFormatter = (cell: CellComponent): HTMLElement => {
    const { id } = cell.getData() as SavedRouteRow;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-actions';
    wrapper.append(
      actionButton(t('loadRouteButton'), 'btn btn-small', () => loadRoute(id)),
      actionButton(t('deleteRouteButton'), 'btn btn-small btn-danger', () => {
        void deleteRoute(id, cell.getRow());
      })
    );
    return wrapper;
  };

  modal.open();

  // See note [1] in the docstring
  const container = modal.query<HTMLElement>('.saved-routes-table');
  if (!container) {
    return modal;
  }

  table = new Tabulator(container, {
    data: rows,
    index: 'id',
    layout: 'fitColumns',
    maxHeight: '60vh',
    placeholder: t('savedRoutesEmpty'),
    initialSort: [{ column: 'createdAtMs', dir: 'desc' }],
    // See note [4] in the docstring
    columnDefaults: { headerWordWrap: true },
    columns: [
      // See note [2] in the docstring
      { title: t('colName'), field: 'name', sorter: 'string', formatter: 'plaintext', widthGrow: 3, minWidth: 140 },
      {
        title: t('colDistance', { unit: unitLabels(options.rowOptions.units).distance }),
        field: 'distance',
        sorter: 'number',
        hozAlign: 'right',
        minWidth: 110,
      },
      {
        title: t('colTime'),
        field: 'durationSeconds',
        sorter: 'number',
        hozAlign: 'right',
        minWidth: 100,
        formatter: (cell) => escapeHtml(formatDuration(cell.getValue() as number)),
      },
      { title: t('colPoints'), field: 'points', sorter: 'number', hozAlign: 'right', minWidth: 80 },
      {
        title: t('colSavedOn'),
        field: 'createdAtMs',
        sorter: 'number',
        minWidth: 120,
        formatter: (cell) => escapeHtml((cell.getData() as SavedRouteRow).createdAtLabel),
      },
      {
        title: t('colActions'),
        field: 'id',
        headerSort: false,
        hozAlign: 'center',
        minWidth: 170,
        formatter: actionsFormatter,
      },
    ],
  });

  // See note [3] in the docstring
  table.on('rowDblClick', (e: UIEvent, row: RowComponent) => {
    if ((e.target as Element | null)?.closest('.table-actions')) return;
    loadRoute((row.getData() as SavedRouteRow).id);
  });

  return modal;
}
