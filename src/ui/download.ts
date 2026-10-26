/** Time in milliseconds before the object URL of a download is released. */
const REVOKE_DELAY_MS = 10_000;

/**
 * Make the browser save a text file.
 *
 * [1] Some browsers start a download only from a link that is in the page.
 * [2] Some browsers read the file after the click returns, so the object
 *     URL is released later.
 *
 * @param fileName Name that the browser suggests for the file.
 * @param text Contents of the file.
 * @param mimeType Media type, for example `application/json`.
 */
export function downloadTextFile(fileName: string, text: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  // See note [1] in the docstring
  document.body.appendChild(link);
  link.click();
  link.remove();
  // See note [2] in the docstring
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
