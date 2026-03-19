# IANA TLDs Root DB Access

Machine-friendly access to the IANA root zone TLD dataset.

This project gives you the same data in three practical ways:

1. As ready-to-consume snapshot files directly from GitHub raw (`csv`, `tsv`,
   `json`)
2. As a library from JSR: `jsr.io/@carragom/tlds`
3. As a CLI you can install globally with Deno

The dataset comes from the IANA Root Zone Database:
https://www.iana.org/domains/root/db

## 1) Use snapshot files from GitHub raw

If you only need static data (no code execution), you can fetch the current
snapshot directly:

- TSV: `https://raw.githubusercontent.com/carragom/tlds/main/data/tlds.tsv`
- CSV: `https://raw.githubusercontent.com/carragom/tlds/main/data/tlds.csv`
- JSON: `https://raw.githubusercontent.com/carragom/tlds/main/data/tlds.json`

Examples:

```bash
curl -L https://raw.githubusercontent.com/carragom/tlds/main/data/tlds.tsv
curl -L https://raw.githubusercontent.com/carragom/tlds/main/data/tlds.csv
curl -L https://raw.githubusercontent.com/carragom/tlds/main/data/tlds.json
```

## 2) Use as a library (JSR)

Import from JSR and fetch the latest dataset directly from IANA.

```ts
import { fetchDataset } from 'jsr:@carragom/tlds'

// TSV string
const { result, errors } = await fetchDataset({ format: 'tsv' })
console.log(result)
console.error(errors)

// JSON string (pretty)
const json = await fetchDataset({ format: 'json', pretty: true })

// Array of records
const rows = await fetchDataset({ format: 'array' })
```

### Supported formats

- `csv`
- `tsv`
- `json`
- `array` (typed objects)

### Notes

- Invalid rows are excluded from output and returned in `errors`.
- Domain bidi display marks are stripped.
- Domain/type validation is applied.

## 3) Use as a CLI

### Install globally

```bash
deno install --global \
  --allow-net=www.iana.org:443 \
  --allow-write=data \
  --allow-read=data \
  jsr:@carragom/tlds
```

### Fetch to stdout (default: TSV)

```bash
tlds fetch
```

Choose format:

```bash
tlds fetch --format csv
tlds fetch --format tsv
tlds fetch --format json
tlds fetch --format json --pretty
```

### Update local data files

```bash
tlds update
```

This writes:

- `data/tlds.csv`
- `data/tlds.json`
- `data/tlds.tsv`
