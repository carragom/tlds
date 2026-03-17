import { assertEquals, assertRejects } from '@std/assert'

import { fetchDataset } from './mod.ts'

Deno.test(async function fetchDatasetCsvTest() {
	const html = `
    <html>
      <body>
        <table class="iana-table">
          <tr><th>Domain</th><th>Type</th><th>Manager</th></tr>
          <tr><td>.com</td><td>generic</td><td>VeriSign Global Registry Services</td></tr>
          <tr><td>.uk</td><td>country-code</td><td>Nominet UK</td></tr>
        </table>
      </body>
    </html>
  `

	const { result, errors } = await fetchDataset({
		format: 'csv',
		fetchImpl: () => Promise.resolve(new Response(html, { status: 200 })),
	})

	assertEquals(
		result,
		'domain,type,manager\n.com,generic,VeriSign Global Registry Services\n.uk,country-code,Nominet UK\n',
	)
	assertEquals(errors.length, 0)
})

Deno.test(async function fetchDatasetJsonTest() {
	const html = `
    <html>
      <body>
        <table class="iana-table">
          <tr><th>Domain</th><th>Type</th><th>Manager</th></tr>
          <tr><td>.com</td><td>generic</td><td>VeriSign Global Registry Services</td></tr>
          <tr><td>.uk</td><td>country-code</td><td>Nominet UK</td></tr>
        </table>
      </body>
    </html>
  `

	const { result, errors } = await fetchDataset({
		format: 'json',
		fetchImpl: () => Promise.resolve(new Response(html, { status: 200 })),
	})

	assertEquals(
		result,
		JSON.stringify([
			{
				domain: '.com',
				type: 'generic',
				manager: 'VeriSign Global Registry Services',
			},
			{
				domain: '.uk',
				type: 'country-code',
				manager: 'Nominet UK',
			},
		]) + '\n',
	)
	assertEquals(errors.length, 0)
})

Deno.test(async function fetchDatasetJsonPrettyTest() {
	const html = `
    <html>
      <body>
        <table class="iana-table">
          <tr><th>Domain</th><th>Type</th><th>Manager</th></tr>
          <tr><td>.com</td><td>generic</td><td>VeriSign Global Registry Services</td></tr>
          <tr><td>.uk</td><td>country-code</td><td>Nominet UK</td></tr>
        </table>
      </body>
    </html>
  `

	const { result, errors } = await fetchDataset({
		format: 'json',
		pretty: true,
		fetchImpl: () => Promise.resolve(new Response(html, { status: 200 })),
	})

	assertEquals(
		result,
		JSON.stringify(
			[
				{
					domain: '.com',
					type: 'generic',
					manager: 'VeriSign Global Registry Services',
				},
				{
					domain: '.uk',
					type: 'country-code',
					manager: 'Nominet UK',
				},
			],
			null,
			2,
		) + '\n',
	)
	assertEquals(errors.length, 0)
})

Deno.test(async function fetchDatasetTsvTest() {
	const html = `
    <html>
      <body>
        <table class="iana-table">
          <tr><th>Domain</th><th>Type</th><th>Manager</th></tr>
          <tr><td>.com</td><td>generic</td><td>VeriSign\nGlobal\tRegistry Services</td></tr>
          <tr><td>.uk</td><td>country-code</td><td>Nominet UK</td></tr>
        </table>
      </body>
    </html>
  `

	const { result, errors } = await fetchDataset({
		format: 'tsv',
		fetchImpl: () => Promise.resolve(new Response(html, { status: 200 })),
	})

	assertEquals(
		result,
		'domain\ttype\tmanager\n.com\tgeneric\tVeriSign Global Registry Services\n.uk\tcountry-code\tNominet UK\n',
	)
	assertEquals(errors.length, 0)
})

Deno.test(async function fetchDatasetArrayTest() {
	const html = `
    <html>
      <body>
        <table class="iana-table">
          <tr><th>Domain</th><th>Type</th><th>Manager</th></tr>
          <tr><td>.com</td><td>generic</td><td>VeriSign Global Registry Services</td></tr>
        </table>
      </body>
    </html>
  `

	const { result, errors } = await fetchDataset({
		format: 'array',
		fetchImpl: () => Promise.resolve(new Response(html, { status: 200 })),
	})

	assertEquals(result, [
		{
			domain: '.com',
			type: 'generic',
			manager: 'VeriSign Global Registry Services',
		},
	])
	assertEquals(errors.length, 0)
})

Deno.test(async function fetchDatasetExcludesInvalidTypeAndDomainTest() {
	const html = `
    <html>
      <body>
        <table class="iana-table">
          <tr><th>Domain</th><th>Type</th><th>Manager</th></tr>
          <tr><td>.com</td><td>generic</td><td>Ok</td></tr>
          <tr><td>.bad..shape</td><td>generic</td><td>Bad domain</td></tr>
          <tr><td>.net</td><td>invalid-type</td><td>Bad type</td></tr>
        </table>
      </body>
    </html>
  `

	const { result, errors } = await fetchDataset({
		format: 'csv',
		fetchImpl: () => Promise.resolve(new Response(html, { status: 200 })),
	})

	assertEquals(result, 'domain,type,manager\n.com,generic,Ok\n')
	assertEquals(errors.length, 2)
	assertEquals(errors[0].code, 'ERR_INVALID_DOMAIN_SHAPE')
	assertEquals(errors[1].code, 'ERR_INVALID_TYPE')
})

Deno.test(async function fetchDatasetStripsBidiMarksTest() {
	const html = `
    <html>
      <body>
        <table class="iana-table">
          <tr><th>Domain</th><th>Type</th><th>Manager</th></tr>
          <tr><td>&#x200f;.ישראל&#x200e;</td><td>country-code</td><td>Manager</td></tr>
        </table>
      </body>
    </html>
  `

	const { result, errors } = await fetchDataset({
		format: 'tsv',
		fetchImpl: () => Promise.resolve(new Response(html, { status: 200 })),
	})

	assertEquals(
		result,
		'domain\ttype\tmanager\n.ישראל\tcountry-code\tManager\n',
	)
	assertEquals(errors.length, 0)
})

Deno.test(async function fetchDatasetThrowsOnHttpErrorTest() {
	await assertRejects(
		() =>
			fetchDataset({
				format: 'csv',
				fetchImpl: () =>
					Promise.resolve(new Response('oops', { status: 503 })),
			}),
		Error,
		'Failed to fetch IANA data',
	)
})
