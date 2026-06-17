# Example prompts for the WFI Canon MCP server

These are example user prompts for an MCP client (e.g. Claude Code) with the WFI
Canon MCP server configured. The server returns source material from the public
canon; it does not summarize or invent scientific content.

## List available canon resources

Use the WFI Canon MCP server to list available canon entries and bundles.

## Retrieve terminology

Retrieve the `terminology` entry and the `deprecated_terms` entry. Then identify whether the terms “Aggregation and Standardization”, “welfare score”, and “Biological Outcomes” need replacement or caution.

## Retrieve a bundle

Retrieve the `core_methodology` bundle. Explain the WFF analytical chain without collapsing Pain and Pleasure into a single score.

## Compare modules

Retrieve Module I, Module II, and Module III. Explain the difference between Circumstances, Biological Consequences, and Affective Experiences.

## Orient first

Run the `orient_to_wfi_canon` prompt, then follow the AI-use rules it points to before doing any canon work.

## Search the index

Use `search_index` with the query “intensity” to find the entries that cover intensity categories, then retrieve them.
