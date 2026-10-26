// Vite gives JSON files named exports. The bundle keeps only this field.
import { version } from '../../package.json';

/** Version of the app from `package.json`, for example `"1.1.0"`. */
export const APP_VERSION: string = version;
