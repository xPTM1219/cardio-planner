import { LANGUAGES, LANGUAGE_NAMES, Language, t } from '../i18n';
import type { HomeLocation, UserSettings } from '../types';
import { validateHomeLocation } from '../components/StorageManager';
import { escapeHtml } from '../utils/format';
import { Modal } from './modal';

/** The settings that the Settings modal changes. */
export type SettingsModalValues = Pick<UserSettings, 'language' | 'units' | 'darkMode' | 'homeLocation'>;

/** Options for {@link openSettingsModal}. */
export interface SettingsModalOptions {
  /** Current settings, used to fill the fields. */
  settings: UserSettings;
  /** Returns the current map view for "Use Current Map View". */
  getCurrentView: () => HomeLocation | null;
  /**
   * Saves and applies the new values. The modal closes when it resolves.
   * When it rejects, the modal stays open and shows an error.
   */
  onSave: (values: SettingsModalValues) => Promise<void>;
}

/**
 * Build one `<option>` element.
 * @param value Option value.
 * @param label Visible text.
 * @param selected `true` to select this option.
 * @returns Option HTML.
 */
function optionHtml(value: string, label: string, selected: boolean): string {
  return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

/**
 * Read a number field. An empty field gives `NaN`, so validation rejects it.
 * @param input Number input element.
 * @returns The value as a number.
 */
function readNumber(input: HTMLInputElement | null): number {
  const raw = input?.value.trim() ?? '';
  return raw === '' ? Number.NaN : Number(raw);
}

/**
 * Open the Settings modal: language, units, theme, and home location.
 *
 * [1] Changes apply only when the user clicks Save. Cancel, Esc, and a click
 *     on the backdrop discard them.
 * [2] Errors show in the modal, because the modal covers the status panel.
 *
 * @param options Current settings and callbacks.
 * @returns The open modal.
 */
export function openSettingsModal(options: SettingsModalOptions): Modal {
  const { settings } = options;
  const home = settings.homeLocation;

  const bodyHtml = `
    <div class="form-group">
      <label for="settings-language">${escapeHtml(t('languageLabel'))}</label>
      <select id="settings-language">
        ${LANGUAGES.map((lang) => optionHtml(lang, LANGUAGE_NAMES[lang], lang === settings.language)).join('')}
      </select>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="settings-units">${escapeHtml(t('unitsLabel'))}</label>
        <select id="settings-units">
          ${optionHtml('metric', t('unitsMetric'), settings.units === 'metric')}
          ${optionHtml('imperial', t('unitsImperial'), settings.units === 'imperial')}
        </select>
      </div>
      <div class="form-group">
        <label for="settings-theme">${escapeHtml(t('themeLabel'))}</label>
        <select id="settings-theme">
          ${optionHtml('light', t('themeLight'), !settings.darkMode)}
          ${optionHtml('dark', t('themeDark'), settings.darkMode)}
        </select>
      </div>
    </div>

    <fieldset class="form-fieldset">
      <legend>${escapeHtml(t('homeLocationTitle'))}</legend>
      <p class="form-hint">${escapeHtml(t('homeLocationHint'))}</p>
      <div class="form-row">
        <div class="form-group">
          <label for="settings-home-lat">${escapeHtml(t('homeLatLabel'))}</label>
          <input type="number" id="settings-home-lat" step="any" min="-90" max="90" value="${home.lat}" />
        </div>
        <div class="form-group">
          <label for="settings-home-lng">${escapeHtml(t('homeLngLabel'))}</label>
          <input type="number" id="settings-home-lng" step="any" min="-180" max="180" value="${home.lng}" />
        </div>
      </div>
      <div class="form-group">
        <label for="settings-home-zoom">${escapeHtml(t('homeZoomLabel'))}</label>
        <input type="number" id="settings-home-zoom" step="1" min="1" max="19" value="${home.zoom}" />
      </div>
      <button type="button" class="btn btn-secondary" id="settings-use-view">${escapeHtml(t('useCurrentViewButton'))}</button>
      <p class="form-hint form-hint-after" id="settings-view-hint" hidden>${escapeHtml(t('homeViewCaptured'))}</p>
    </fieldset>

    <p class="modal-error" id="settings-error" role="alert" hidden></p>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary" data-modal-close>${escapeHtml(t('cancelButton'))}</button>
    <button type="submit" class="btn" id="settings-save">${escapeHtml(t('saveButton'))}</button>
  `;

  // See note [1] in the docstring
  const modal: Modal = new Modal({
    id: 'settings-modal',
    title: t('settingsTitle'),
    bodyHtml,
    footerHtml,
    onSubmit: () => save(),
  });

  const latInput = modal.query<HTMLInputElement>('#settings-home-lat');
  const lngInput = modal.query<HTMLInputElement>('#settings-home-lng');
  const zoomInput = modal.query<HTMLInputElement>('#settings-home-zoom');
  const errorEl = modal.query<HTMLElement>('#settings-error');
  const saveBtn = modal.query<HTMLButtonElement>('#settings-save');
  const viewHint = modal.query<HTMLElement>('#settings-view-hint');

  const showError = (message: string | null): void => {
    if (!errorEl) return;
    errorEl.textContent = message ?? '';
    errorEl.hidden = message === null;
  };

  modal.query<HTMLButtonElement>('#settings-use-view')?.addEventListener('click', () => {
    const view = options.getCurrentView();
    if (!view || !latInput || !lngInput || !zoomInput) return;
    latInput.value = view.lat.toFixed(6);
    lngInput.value = view.lng.toFixed(6);
    zoomInput.value = String(Math.round(view.zoom));
    if (viewHint) viewHint.hidden = false;
    showError(null);
  });

  async function save(): Promise<void> {
    const homeLocation: HomeLocation = {
      lat: readNumber(latInput),
      lng: readNumber(lngInput),
      zoom: readNumber(zoomInput),
    };

    // See note [2] in the docstring
    const errorKey = validateHomeLocation(homeLocation);
    if (errorKey) {
      showError(t(errorKey));
      const field = errorKey === 'errorLatitudeRange' ? latInput : errorKey === 'errorLongitudeRange' ? lngInput : zoomInput;
      field?.focus();
      return;
    }

    const values: SettingsModalValues = {
      language: (modal.query<HTMLSelectElement>('#settings-language')?.value ?? settings.language) as Language,
      units: modal.query<HTMLSelectElement>('#settings-units')?.value === 'imperial' ? 'imperial' : 'metric',
      darkMode: modal.query<HTMLSelectElement>('#settings-theme')?.value === 'dark',
      homeLocation,
    };

    if (saveBtn) saveBtn.disabled = true;
    try {
      await options.onSave(values);
      modal.close();
    } catch (error) {
      console.error('Error saving settings:', error);
      showError(t('statusSettingsSaveError'));
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  modal.open();
  return modal;
}
