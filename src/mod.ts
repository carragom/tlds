/**
 * Machine-friendly access to the IANA root zone TLD dataset.
 * This project gives you the same data in three practical ways:
 * 1. As ready-to-consume snapshot files directly from GitHub raw (`csv`, `tsv`,`json`)
 * 2. As a library from JSR: `jsr.io/@carragom/tlds`
 * 3. As a CLI you can install globally with Deno
 * The dataset comes from the
 * {@link https://www.iana.org/domains/root/db IANA Root Zone Database}
 *
 * @example Get Snapshot Files from GitHub
 * ```sh
 * curl -LJO https://raw.githubusercontent.com/carragom/tlds/main/snapshot/tlds.csv
 * curl -LJO https://raw.githubusercontent.com/carragom/tlds/main/snapshot/tlds.tsv
 * curl -LJO https://raw.githubusercontent.com/carragom/tlds/main/snapshot/tlds.json
 * ```
 *
 * @example Use the Library from JSR
 * ```js
 * import { fetchDataset } from 'https://jsr.io/@carragom/tlds';
 * const dataset = await fetchDataset();
 * console.log(dataset);
 * ```
 * @module
 */

export {
	type DatasetError,
	type DatasetErrorCode,
	type DatasetFormat,
	fetchDataset,
	type FetchDatasetOptions,
	type TldRecord,
} from './dataset.ts'
