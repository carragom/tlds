import { domainToASCII } from 'node:url'

import { DOMParser } from '@b-fuze/deno-dom'
import { stringify } from '@std/csv'
import { ensureDir } from '@std/fs'
import { dirname } from '@std/path'

const DEFAULT_URL = 'https://www.iana.org/domains/root/db'
const DEFAULT_CSV_OUTPUT_PATH = 'data/tlds.csv'
const DEFAULT_JSON_OUTPUT_PATH = 'data/tlds.json'
const DEFAULT_TSV_OUTPUT_PATH = 'data/tlds.tsv'

const CSV_HEADER = ['domain', 'type', 'manager'] as const

const VALID_TYPES = new Set([
	'country-code',
	'generic',
	'generic-restricted',
	'infrastructure',
	'sponsored',
	'test',
])

/**
 * Normalized TLD entry from the IANA root zone database.
 *
 * - `domain` always uses `.label` form (for example `.com`).
 * - `type` is the IANA category string for the TLD.
 * - `manager` is the registry/manager text as published by IANA.
 */
export type TldRecord = {
	domain: string
	type: string
	manager: string
}

/**
 * Output format supported by {@link fetchDataset}.
 *
 * - `array` returns structured {@link TldRecord} objects.
 * - `csv`, `json`, and `tsv` return serialized text.
 */
export type DatasetFormat = 'csv' | 'json' | 'tsv' | 'array'

/**
 * Row-level validation codes returned in {@link DatasetError}.
 *
 * - `ERR_INVALID_TYPE`: the row `type` is not a recognized IANA category.
 * - `ERR_INVALID_DOMAIN_SHAPE`: the domain is not a single `.label` value.
 * - `ERR_INVALID_DOMAIN_IDNA`: the domain label fails IDNA ToASCII conversion.
 */
export type DatasetErrorCode =
	| 'ERR_INVALID_TYPE'
	| 'ERR_INVALID_DOMAIN_SHAPE'
	| 'ERR_INVALID_DOMAIN_IDNA'

/**
 * Validation problem found while processing one row from the upstream dataset.
 *
 * These errors are returned in results instead of being thrown, so callers can
 * inspect partial success and decide how to handle invalid rows.
 *
 * - `row` is 1-based within the parsed IANA table rows.
 * - `field` identifies the column that failed validation.
 * - `value` preserves the offending source value.
 */
export type DatasetError = {
	code: DatasetErrorCode
	row: number
	field: 'domain' | 'type'
	value: string
	message: string
}

/**
 * Options for fetching and formatting the current TLD dataset.
 *
 * - `format` selects the returned representation.
 * - `fetchImpl` lets tests or custom runtimes inject their own fetch function.
 * - `pretty` only affects JSON output.
 */
export type FetchDatasetOptions = {
	format: DatasetFormat
	fetchImpl?: typeof fetch
	pretty?: boolean
}

/**
 * Options for downloading the current dataset and writing snapshot files.
 *
 * Any omitted output path falls back to the default file under `data/`.
 * `fetchImpl` can be replaced for tests or custom runtimes.
 */
export type UpdateDatasetOptions = {
	csvOutputPath?: string
	jsonOutputPath?: string
	tsvOutputPath?: string
	fetchImpl?: typeof fetch
}

/**
 * Result returned by {@link updateDataset} after writing snapshot files.
 *
 * - `errors` contains row-level validation issues encountered during processing.
 * - `writtenFiles` reports the paths that were written.
 * - `counts` summarizes valid and invalid row totals.
 */
export type UpdateDatasetResult = {
	errors: DatasetError[]
	writtenFiles: {
		csv: string
		json: string
		tsv: string
	}
	counts: {
		validRows: number
		errorRows: number
	}
}

type PrepareResult = {
	validRows: TldRecord[]
	errors: DatasetError[]
}

type PrepareRowsOptions = {
	stripManager?: boolean
	strictType?: boolean
	stripBidi?: boolean
}

/**
 * Extract raw TLD rows from the IANA Root Zone Database HTML.
 *
 * Expected upstream structure (https://www.iana.org/domains/root/db):
 * - A data table with selector `table.iana-table`.
 * - Table body rows as `<tr>` entries with `<td>` cells in this order:
 *   1) domain
 *   2) type
 *   3) manager
 *
 * Parsing behavior:
 * - Header rows (`<th>`) are ignored because only `<td>` values are read.
 * - Cell text is trimmed.
 * - Empty cell values are skipped.
 * - Rows without any non-empty `<td>` values are skipped.
 *
 * If this function starts throwing in normal operation, the most likely cause is
 * an upstream HTML structure change on the IANA page.
 *
 * @param html Raw HTML document from the IANA root database page.
 * @returns Raw table rows extracted from `<td>` cells.
 * @throws {Error} When `table.iana-table` cannot be found.
 */
export function extractRowsFromHtml(html: string): string[][] {
	const document = new DOMParser().parseFromString(html, 'text/html')

	const table = document.querySelector('table.iana-table')
	if (table === null) {
		throw new Error(
			'Could not find IANA table with selector table.iana-table',
		)
	}

	const rows: string[][] = []
	for (const row of table.querySelectorAll('tr')) {
		const rowData: string[] = []
		for (const cell of row.querySelectorAll('td')) {
			const value = cell.textContent.trim()
			if (value) {
				rowData.push(value)
			}
		}

		if (rowData.length > 0) {
			rows.push(rowData)
		}
	}

	return rows
}

/**
 * Strip Unicode bidi display marks from domains.
 *
 * Context:
 * IANA wraps some RTL labels with LRM/RLM for display in HTML pages.
 * Those are presentation controls, not part of the canonical domain label.
 *
 * Characters removed:
 * - U+200E LEFT-TO-RIGHT MARK
 * - U+200F RIGHT-TO-LEFT MARK
 */
function stripBidiDisplayMarks(value: string): string {
	return value.replace(/[\u200E\u200F]/g, '')
}

/**
 * Validate and normalize raw IANA rows into typed records.
 *
 * Validation steps:
 * 1) Optionally strip bidi display marks from domain.
 * 2) Optionally validate type against the known IANA type set.
 * 3) Validate domain shape (`.label` with one label only).
 * 4) Validate domain label with IDNA ToASCII conversion.
 *
 * IDNA reference:
 * - IETF IDNA2008 family (RFC 5890/5891/5892/5893)
 * - Runtime conversion uses WHATWG/UTS #46 behavior via `node:url` `domainToASCII`.
 *   Empty-string conversion is treated as invalid label.
 *
 * The function never throws for row-level validation problems; it returns errors.
 *
 * @param rows Raw parsed rows from the IANA table.
 * @param options Row processing options.
 * @param options.stripManager Replace `\r`, `\n`, and `\t` in manager with spaces. Defaults to `false`.
 * @param options.strictType Validate `type` against the known IANA type set. Defaults to `true`.
 * @param options.stripBidi Strip domain bidi display marks (`U+200E`, `U+200F`). Defaults to `true`.
 * @returns Processed records and row-level validation errors.
 */
function prepareRows(
	rows: string[][],
	options: PrepareRowsOptions = {},
): PrepareResult {
	const {
		stripManager = false,
		strictType = true,
		stripBidi = true,
	} = options

	const validRows: TldRecord[] = []
	const errors: DatasetError[] = []

	for (const [index, row] of rows.entries()) {
		const rowNumber = index + 1
		const domainRaw = row[0] ?? ''
		const domain = stripBidi ? stripBidiDisplayMarks(domainRaw) : domainRaw
		const type = row[1] ?? ''
		const managerRaw = row[2] ?? ''

		if (strictType && !VALID_TYPES.has(type)) {
			errors.push({
				code: 'ERR_INVALID_TYPE',
				row: rowNumber,
				field: 'type',
				value: type,
				message: `Invalid type at row ${rowNumber}: ${type}`,
			})
			continue
		}

		if (
			!domain.startsWith('.') || domain.slice(1).includes('.') ||
			domain.length <= 1
		) {
			errors.push({
				code: 'ERR_INVALID_DOMAIN_SHAPE',
				row: rowNumber,
				field: 'domain',
				value: domain,
				message: `Invalid domain shape at row ${rowNumber}: ${domain}`,
			})
			continue
		}

		const label = domain.slice(1)
		const asciiLabel = domainToASCII(label)
		if (!asciiLabel) {
			errors.push({
				code: 'ERR_INVALID_DOMAIN_IDNA',
				row: rowNumber,
				field: 'domain',
				value: domain,
				message: `Invalid domain label at row ${rowNumber}: ${domain}`,
			})
			continue
		}

		const manager = stripManager
			? managerRaw.replace(/[\r\n\t]/g, ' ')
			: managerRaw

		validRows.push({
			domain,
			type,
			manager,
		})
	}

	return { validRows, errors }
}

function serializeDelimited(rows: TldRecord[], separator: string): string {
	const data = rows.map((row) => [row.domain, row.type, row.manager])
	return stringify([CSV_HEADER, ...data], { separator }).replaceAll(
		'\r\n',
		'\n',
	)
}

function serializeJson(rows: TldRecord[], pretty = false): string {
	if (pretty) {
		return JSON.stringify(rows, null, 2) + '\n'
	}
	return JSON.stringify(rows) + '\n'
}

function formatResult(
	rows: TldRecord[],
	format: DatasetFormat,
	pretty = false,
): string | TldRecord[] {
	if (format === 'array') {
		return rows
	}

	if (format === 'csv') {
		return serializeDelimited(rows, ',')
	}

	if (format === 'tsv') {
		return serializeDelimited(rows, '\t')
	}

	return serializeJson(rows, pretty)
}

async function fetchRows(fetchImpl: typeof fetch): Promise<string[][]> {
	const response = await fetchImpl(DEFAULT_URL)
	if (!response.ok) {
		throw new Error(
			`Failed to fetch IANA data: ${response.status} ${response.statusText}`,
		)
	}

	const html = await response.text()
	return extractRowsFromHtml(html)
}

/**
 * Fetch and process TLD (Top-Level Domain) data from the IANA Root Zone Database.
 *
 * This function retrieves the current list of TLDs from IANA, validates and normalizes
 * the data, and returns it in the requested format. It provides type-safe overloads
 * for different output formats.
 *
 * Validation includes:
 * - Domain shape validation (must be `.label` format with single label)
 * - Type validation against known IANA types
 * - IDNA ToASCII conversion for internationalized domain names
 * - Automatic stripping of bidi display marks from domains
 *
 * @param options - Configuration options for fetching and formatting
 * @param options.format - Output format: 'array', 'csv', 'json', or 'tsv'
 * @param options.fetchImpl - Custom fetch implementation (defaults to native fetch)
 * @param options.pretty - Pretty-print JSON output (only for 'json' format)
 * @returns Promise resolving to an object containing:
 *   - `result`: The formatted TLD data (array or string depending on format)
 *   - `errors`: Array of validation errors encountered during processing
 *
 * @throws {Error} When the IANA page structure changes or network request fails
 *
 * @example
 * // Fetch TLDs as an array
 * const { result, errors } = await fetchDataset({
 *   format: 'array'
 * });
 * console.log(result[0]); // { domain: '.com', type: 'generic', manager: 'VeriSign Global...' }
 *
 * @example
 * // Fetch TLDs as formatted CSV
 * const { result, errors } = await fetchDataset({
 *   format: 'csv'
 * });
 * console.log(result); // "domain,type,manager\n.com,generic,VeriSign..."
 *
 * @example
 * // Fetch TLDs as pretty-printed JSON
 * const { result, errors } = await fetchDataset({
 *   format: 'json',
 *   pretty: true
 * });
 * if (errors.length > 0) {
 *   console.warn(`Processing had ${errors.length} validation errors`);
 * }
 */
export async function fetchDataset(
	options: FetchDatasetOptions & { format: 'array' },
): Promise<{ result: TldRecord[]; errors: DatasetError[] }>
export async function fetchDataset(
	options: FetchDatasetOptions & { format: 'csv' | 'json' | 'tsv' },
): Promise<{ result: string; errors: DatasetError[] }>
export async function fetchDataset(
	options: FetchDatasetOptions,
): Promise<{ result: string | TldRecord[]; errors: DatasetError[] }> {
	const { format, fetchImpl = fetch, pretty = false } = options
	const rows = await fetchRows(fetchImpl)
	const prepared = prepareRows(rows, { stripManager: true })

	return {
		result: formatResult(prepared.validRows, format, pretty),
		errors: prepared.errors,
	}
}

/**
 * Fetch the current IANA root zone dataset and write CSV, JSON, and TSV snapshots.
 *
 * This function downloads the live root zone table, validates and normalizes the
 * rows, then writes three snapshot files to disk. Invalid rows are excluded from
 * the written output and reported in the returned `errors` array.
 *
 * Default output paths:
 * - CSV: `data/tlds.csv`
 * - JSON: `data/tlds.json`
 * - TSV: `data/tlds.tsv`
 *
 * Error handling:
 * - Row validation issues are returned in `errors`.
 * - Network failures, upstream HTML structure changes, and file system write
 *   failures are thrown.
 *
 * @param options Configuration for output paths and fetch behavior.
 * @param options.csvOutputPath Destination path for the CSV snapshot.
 * @param options.jsonOutputPath Destination path for the JSON snapshot.
 * @param options.tsvOutputPath Destination path for the TSV snapshot.
 * @param options.fetchImpl Custom fetch implementation (defaults to native fetch).
 * @returns Paths written, validation errors, and counts of valid/error rows.
 *
 * @example
 * ```ts
 * const result = await updateDataset({
 *   csvOutputPath: 'snapshot/tlds.csv',
 *   jsonOutputPath: 'snapshot/tlds.json',
 *   tsvOutputPath: 'snapshot/tlds.tsv',
 * })
 *
 * console.log(result.writtenFiles.json)
 * console.log(result.counts.validRows)
 * ```
 */
export async function updateDataset(
	options: UpdateDatasetOptions = {},
): Promise<UpdateDatasetResult> {
	const {
		csvOutputPath = DEFAULT_CSV_OUTPUT_PATH,
		jsonOutputPath = DEFAULT_JSON_OUTPUT_PATH,
		tsvOutputPath = DEFAULT_TSV_OUTPUT_PATH,
		fetchImpl = fetch,
	} = options

	const rows = await fetchRows(fetchImpl)
	const prepared = prepareRows(rows)

	await ensureDir(dirname(csvOutputPath))
	await ensureDir(dirname(jsonOutputPath))
	await ensureDir(dirname(tsvOutputPath))

	await Deno.writeTextFile(
		csvOutputPath,
		serializeDelimited(prepared.validRows, ','),
	)
	await Deno.writeTextFile(jsonOutputPath, serializeJson(prepared.validRows))
	await Deno.writeTextFile(
		tsvOutputPath,
		serializeDelimited(prepared.validRows, '\t'),
	)

	return {
		errors: prepared.errors,
		writtenFiles: {
			csv: csvOutputPath,
			json: jsonOutputPath,
			tsv: tsvOutputPath,
		},
		counts: {
			validRows: prepared.validRows.length,
			errorRows: prepared.errors.length,
		},
	}
}
