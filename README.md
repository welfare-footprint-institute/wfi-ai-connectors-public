# WFI AI Connectors

This repository contains public, read-only connector specifications for AI tools that need to retrieve selected files from the WFI Scientific Canon.

The canonical scientific content is not stored here. It lives in:

`welfare-footprint-institute/wfi-scientific-canon-public`

This repository only provides connector files, such as OpenAPI schemas for Custom GPT Actions.

## Current connector

- `chatgpt-actions/wfi-canon-reader.openapi.yaml`

This OpenAPI schema allows a Custom GPT to retrieve selected live files from the WFI Scientific Canon repository using public raw GitHub URLs.

The schema can be imported from:

`https://raw.githubusercontent.com/welfare-footprint-institute/wfi-ai-connectors-public/main/chatgpt-actions/wfi-canon-reader.openapi.yaml`

## Scope

This repository is for connector specifications only.

It should not contain:

- workshop participant instructions;
- workshop agendas;
- scientific canon content;
- draft methodology;
- unpublished WFI material;
- internal strategy;
- app prototypes;
- GPT templates for individual tools;
- screenshots;
- participant exercises;
- private keys, tokens, or credentials.

## Authentication

The current connector is read-only and uses public files, so no authentication is required.

When configuring the Custom GPT Action, set authentication to `None`.

## Privacy policy requirement

Public GPTs using these actions must include a valid privacy policy URL in the GPT Action configuration.

Prefer the official Welfare Footprint Institute website privacy policy.

Do not use these connector files in a public GPT until that URL is available.

## Instructions vs external source material

Instructions define the GPT’s behavior and task.

The GitHub canon is external source material retrieved through an Action.

Avoid copying canon definitions into the GPT Instructions field.

## License scope

The MIT license in this repository applies to the connector specifications in this repository.

It does not change the status, license, citation requirements, or governance of the WFI Scientific Canon content retrieved by these connectors.

## Maintainers

Welfare Footprint Institute
