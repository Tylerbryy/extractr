# extractr

Template-based data extraction from web pages using YAML configs.

## Installation

```bash
bun install
bun run build
```

## Usage

### Using Built-in Templates

```bash
# List available templates
extractr list

# Extract using built-in template
extractr extract https://news.ycombinator.com @hn-frontpage

# With output file
extractr extract https://news.ycombinator.com @hn-frontpage -o output.json

# Different formats
extractr extract https://news.ycombinator.com @hn-frontpage --format jsonl
extractr extract https://news.ycombinator.com @hn-frontpage --format csv -o output.csv
```

### Using Custom Templates

```bash
# Create a template file (template.yaml)
extractr extract https://example.com template.yaml --local

# Validate template
extractr extract https://example.com template.yaml --validate

# Debug mode
extractr extract https://example.com template.yaml --debug

# Interactive TUI
extractr extract https://example.com template.yaml --interactive
```

## Template Format

```yaml
name: My Template
description: Extract product listings
container: .product-card
fields:
  - name: title
    selector: h2.title
    type: text
    transforms:
      - type: trim
      - type: uppercase
    
  - name: price
    selector: .price
    type: currency
    transforms:
      - type: regex
        params:
          pattern: '\$(\d+\.?\d*)'
          group: 1
      - type: parseFloat
    
  - name: url
    selector: a.product-link
    type: url
    attr: href
    
  - name: features
    selector: .feature-list li
    type: list
    
  - name: reviews
    selector: .review
    type: nested
    nested:
      - name: author
        selector: .reviewer-name
        type: text
      - name: rating
        selector: .star-rating
        type: number
        attr: data-rating

pagination:
  nextSelector: .next-page
  maxPages: 5
  waitMs: 2000

options:
  waitForSelector: .product-card
  enableJs: true
  timeout: 30000
```

## Field Types

- `text` - Plain text content
- `number` - Numeric value
- `currency` - Currency/price value
- `date` - Date (converted to ISO string)
- `boolean` - Boolean value
- `list` - Array of values
- `nested` - Nested object with sub-fields
- `html` - Raw HTML content
- `url` - URL (converts relative to absolute)

## Transforms

- `trim` - Remove whitespace
- `lowercase` - Convert to lowercase
- `uppercase` - Convert to uppercase
- `replace` - Replace text (params: pattern, replacement, flags)
- `regex` - Extract with regex (params: pattern, group)
- `split` - Split into array (params: separator)
- `slice` - Slice string (params: start, end)
- `parseInt` - Parse integer
- `parseFloat` - Parse float

## Built-in Templates

### @hn-frontpage
Extract stories from Hacker News frontpage
```bash
extractr extract https://news.ycombinator.com @hn-frontpage
```

### @amazon-product
Extract product listings from Amazon search results
```bash
extractr extract "https://amazon.com/s?k=laptop" @amazon-product
```

### @reddit-subreddit
Extract posts from Reddit subreddit
```bash
extractr extract https://reddit.com/r/programming @reddit-subreddit
```

## Options

- `-o, --output <file>` - Output file path
- `--format <type>` - Output format: json, jsonl, csv (default: json)
- `--validate` - Validate template without extracting
- `--local` - Load template from local file
- `--debug` - Show detailed extraction info
- `-i, --interactive` - Interactive debug TUI

## Examples

### Custom Template Example

```yaml
name: GitHub Trending
container: article.Box-row
fields:
  - name: repo
    selector: h2 a
    type: text
    transforms:
      - type: trim
      
  - name: description
    selector: p
    type: text
    
  - name: stars
    selector: 'svg.octicon-star ~ span'
    type: number
    transforms:
      - type: replace
        params:
          pattern: ','
          replacement: ''
      - type: parseInt
```

Save as `github-trending.yaml` and run:
```bash
extractr extract https://github.com/trending github-trending.yaml --local
```
