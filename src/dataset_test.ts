import { assertEquals } from '@std/assert'

import { extractRowsFromHtml, fetchDataset, updateDataset } from './dataset.ts'

Deno.test(function extractRowsFromHtmlTest() {
	const html = `
    <html>
      <body>
        <table class="iana-table">
          <tr>
            <th>Domain</th><th>Type</th><th>Manager</th>
          </tr>
          <tr>
            <td>.com</td><td>generic</td><td>VeriSign Global Registry Services</td>
          </tr>
          <tr>
            <td>.uk</td><td>country-code</td><td>Nominet UK</td>
          </tr>
          <tr>
            <td>   </td><td></td><td></td>
          </tr>
        </table>
      </body>
    </html>
  `

	assertEquals(extractRowsFromHtml(html), [
		['.com', 'generic', 'VeriSign Global Registry Services'],
		['.uk', 'country-code', 'Nominet UK'],
	])
})

Deno.test(async function fetchManagerIsNormalizedButUpdateIsNotTest() {
	const html = `
    <html>
      <body>
        <table class="iana-table">
          <tr><th>Domain</th><th>Type</th><th>Manager</th></tr>
          <tr><td>.com</td><td>generic</td><td>Line A\nLine\tB</td></tr>
        </table>
      </body>
    </html>
  `

	const fetched = await fetchDataset({
		format: 'json',
		fetchImpl: () => Promise.resolve(new Response(html, { status: 200 })),
	})

	assertEquals(
		fetched.result,
		JSON.stringify([
			{ domain: '.com', type: 'generic', manager: 'Line A Line B' },
		]) + '\n',
	)

	const tempDir = await Deno.makeTempDir()
	try {
		const result = await updateDataset({
			csvOutputPath: `${tempDir}/tlds.csv`,
			jsonOutputPath: `${tempDir}/tlds.json`,
			tsvOutputPath: `${tempDir}/tlds.tsv`,
			fetchImpl: () => Promise.resolve(new Response(html, { status: 200 })),
		})

		assertEquals(result.errors.length, 0)

		const json = await Deno.readTextFile(`${tempDir}/tlds.json`)
		assertEquals(
			json,
			JSON.stringify([
				{ domain: '.com', type: 'generic', manager: 'Line A\nLine\tB' },
			]) + '\n',
		)

		const tsv = await Deno.readTextFile(`${tempDir}/tlds.tsv`)
		assertEquals(
			tsv,
			'domain\ttype\tmanager\n.com\tgeneric\t"Line A\nLine\tB"\n',
		)
	} finally {
		await Deno.remove(tempDir, { recursive: true })
	}
})

Deno.test(async function updateDatasetWritesCsvJsonTsvAndReturnsErrorsTest() {
	const html = `
    <html>
      <body>
        <table class="iana-table">
          <tr><th>Domain</th><th>Type</th><th>Manager</th></tr>
          <tr><td>.com</td><td>generic</td><td>VeriSign</td></tr>
          <tr><td>.bad..shape</td><td>generic</td><td>Bad Domain</td></tr>
          <tr><td>.net</td><td>invalid-type</td><td>Bad Type</td></tr>
        </table>
      </body>
    </html>
  `

	const tempDir = await Deno.makeTempDir()
	const csvPath = `${tempDir}/tlds.csv`
	const jsonPath = `${tempDir}/tlds.json`
	const tsvPath = `${tempDir}/tlds.tsv`

	let fetchCalls = 0

	try {
		const result = await updateDataset({
			csvOutputPath: csvPath,
			jsonOutputPath: jsonPath,
			tsvOutputPath: tsvPath,
			fetchImpl: () => {
				fetchCalls += 1
				return Promise.resolve(new Response(html, { status: 200 }))
			},
		})

		assertEquals(fetchCalls, 1)
		assertEquals(result.errors.length, 2)
		assertEquals(result.counts.validRows, 1)
		assertEquals(result.counts.errorRows, 2)

		const csv = await Deno.readTextFile(csvPath)
		const json = await Deno.readTextFile(jsonPath)
		const tsv = await Deno.readTextFile(tsvPath)

		assertEquals(csv, 'domain,type,manager\n.com,generic,VeriSign\n')
		assertEquals(
			json,
			JSON.stringify([{
				domain: '.com',
				type: 'generic',
				manager: 'VeriSign',
			}]) +
				'\n',
		)
		assertEquals(tsv, 'domain\ttype\tmanager\n.com\tgeneric\tVeriSign\n')
	} finally {
		await Deno.remove(tempDir, { recursive: true })
	}
})
