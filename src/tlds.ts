import { parseArgs } from '@std/cli'

import {
	type DatasetError,
	type DatasetFormat,
	fetchDataset,
	updateDataset,
} from './dataset.ts'

export async function main(args: string[] = Deno.args): Promise<void> {
	const [command, ...rest] = args

	if (command === 'fetch') {
		const parsed = parseArgs(rest, {
			string: ['format'],
			boolean: ['pretty'],
			default: {
				format: 'tsv',
				pretty: false,
			},
		})

		const format = parsed.format
		if (format !== 'csv' && format !== 'json' && format !== 'tsv') {
			throw new Error(
				`Invalid --format value: ${String(format)}\n${usage()}`,
			)
		}

		const { result, errors } = await fetchDataset({
			format: format as Exclude<DatasetFormat, 'array'>,
			pretty: parsed.pretty,
		})

		await Deno.stdout.write(new TextEncoder().encode(result))
		printErrors(errors)
		return
	}

	if (command === 'update') {
		const result = await updateDataset()
		printErrors(result.errors)
		return
	}

	throw new Error(usage())
}

function printErrors(errors: DatasetError[]): void {
	for (const error of errors) {
		console.error(error.message)
	}

	if (errors.length > 0) {
		Deno.exitCode = 1
	}
}

function usage(): string {
	return `Usage:
  deno run <file> fetch [--format tsv|csv|json] [--pretty]
  deno run <file> update

fetch:
  --format defaults to tsv
  --pretty only affects --format json
  outputs to stdout only (does not write data files)
  strips domain bidi display marks (U+200E, U+200F)
  validates type and domain, excludes invalid rows, reports errors
  normalizes manager by replacing tabs/newlines with spaces

update:
  writes data/tlds.csv
  writes data/tlds.json
  writes data/tlds.tsv
  strips domain bidi display marks (U+200E, U+200F)
  validates type and domain, excludes invalid rows, reports errors
  writes manager as received (no normalization)`
}

if (import.meta.main) {
	main().catch((error) => {
		const message = error instanceof Error ? error.message : String(error)
		console.error(message)
		Deno.exit(1)
	})
}
