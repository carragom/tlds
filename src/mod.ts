/**
 * Machine friendly access to the IANA root zone TLD dataset.
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
 * ```ts
 * import { fetchDataset } from 'https://jsr.io/@carragom/tlds';
 * const dataset = await fetchDataset({ format: 'array' });
 * console.log(dataset);
 * ```
 *
 * @example Use the CLI with Deno
 * ```sh
 * deno run --reload --allow-net=www.iana.org:443 jsr:@carragom/tlds/cli fetch
 * ```
 *
 * @example Install the CLI globally with Deno
 * ```sh
 * deno install --global --reload --name tlds --allow-net=www.iana.org:443 --allow-write=data --allow-read=data jsr:@carragom/tlds/cli
 * tlds fetch --format json --pretty
 * tlds update
 * ```
 *
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
