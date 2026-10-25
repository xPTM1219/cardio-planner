import { t } from '../i18n';
import { escapeHtml } from '../utils/format';

/** Options for {@link Modal}. */
export interface ModalOptions {
  /** Id of the `<dialog>` element. The title gets the id `<id>-title`. */
  id: string;
  /** Plain-text title. */
  title: string;
  /** Body HTML. The caller must escape user text in it. */
  bodyHtml: string;
  /** Footer HTML, usually the buttons. */
  footerHtml: string;
  /** Extra CSS class for the dialog, for example `modal-wide`. */
  className?: string;
  /**
   * Called when the form is submitted (a submit button or the Enter key).
   * The modal stays open; the handler closes it when it is done.
   */
  onSubmit?: () => void | Promise<void>;
  /** Called after the dialog is closed and removed from the page. */
  onClose?: () => void;
}

/**
 * A modal window built on the native `<dialog>` element.
 *
 * The dialog is in the browser top layer, above the Leaflet map. The browser
 * keeps the focus in the dialog and closes it with the Esc key. The dialog
 * is created when the modal opens and removed when it closes, so its text is
 * always in the active language.
 *
 * Any element with the `data-modal-close` attribute closes the modal.
 */
export class Modal {
  /** The dialog element. */
  readonly element: HTMLDialogElement;
  private readonly options: ModalOptions;
  private pointerDownOnBackdrop = false;

  /**
   * Build the dialog. It is not in the page until {@link open} is called.
   *
   * [1] The body and footer are in a `<form>`, so the Enter key in a field
   *     submits the modal.
   * [2] A click on the backdrop closes the modal. The click must also start
   *     on the backdrop, so a text selection that ends outside the dialog
   *     does not close it.
   *
   * @param options Content and callbacks.
   */
  constructor(options: ModalOptions) {
    this.options = options;

    const dialog = document.createElement('dialog');
    dialog.id = options.id;
    dialog.className = ['modal', options.className ?? ''].join(' ').trim();
    dialog.setAttribute('aria-labelledby', `${options.id}-title`);
    // See note [1] in the docstring
    dialog.innerHTML = `
      <form class="modal-content" novalidate>
        <header class="modal-header">
          <h2 class="modal-title" id="${escapeHtml(options.id)}-title">${escapeHtml(options.title)}</h2>
          <button type="button" class="modal-close" data-modal-close aria-label="${escapeHtml(t('closeButton'))}">&times;</button>
        </header>
        <div class="modal-body">${options.bodyHtml}</div>
        <footer class="modal-footer">${options.footerHtml}</footer>
      </form>
    `;
    this.element = dialog;

    dialog.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest('[data-modal-close]')) {
        this.close();
        return;
      }
      // See note [2] in the docstring
      if (target === dialog && this.pointerDownOnBackdrop) {
        this.close();
      }
    });
    dialog.addEventListener('pointerdown', (e: PointerEvent) => {
      this.pointerDownOnBackdrop = e.target === dialog;
    });

    dialog.querySelector('form')?.addEventListener('submit', (e: SubmitEvent) => {
      e.preventDefault();
      void this.options.onSubmit?.();
    });

    dialog.addEventListener('close', () => {
      dialog.remove();
      this.options.onClose?.();
    });
  }

  /**
   * Add the dialog to the page and show it as a modal.
   * @param container Parent element; defaults to `#modals`, else `<body>`.
   */
  open(container: HTMLElement | null = document.getElementById('modals')): void {
    (container ?? document.body).appendChild(this.element);
    this.element.showModal();
  }

  /** Close the modal. The `close` event removes it and calls `onClose`. */
  close(): void {
    if (this.element.open) {
      this.element.close();
    }
  }

  /**
   * Find an element in the modal.
   * @param selector CSS selector.
   * @returns The first match, or `null`.
   */
  query<T extends Element>(selector: string): T | null {
    return this.element.querySelector<T>(selector);
  }
}
