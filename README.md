# GHAS Licensing Analysis Tool

This tool helps analyze GitHub Advanced Security (GHAS) usage across repositories in a GitHub Enterprise or organization. It provides insights into active committers using different GHAS features like Secret Scanning and Code Scanning.

## Features

- Reports total active committers across the enterprise
- Shows maximum and purchased committer allocations
- Analyzes per-tool usage for:
  - Secret Scanning
  - Code Scanning
- Supports filtering by organization
- Provides detailed committer lists with verbose mode

## Requirements

- Node.js >= 20.0.0
- GitHub Personal Access Token with enterprise access
- GitHub Enterprise instance

## Environment Setup

```bash
export GITHUB_TOKEN=your_pat_token
export GITHUB_BASE_URL=your_github_url  # Optional for GitHub Enterprise Server
```

## Installation

```bash
npm install
```

## Usage

Basic usage:
```bash
node ghas-licensing-by-tool.js --enterprise <enterprise-name>
```

With organization filter:
```bash
node ghas-licensing-by-tool.js --enterprise <enterprise-name> --org <organization-name>
```

Options:
- `--enterprise`, `-e`: (Required) Enterprise name
- `--org`, `-o`: (Optional) Filter results to specific organization
- `--verbose`, `-v`: Show detailed output including per-committer information
- `--help`, `-h`: Show help message

## License

MIT
