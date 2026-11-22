# ADR 0001: Initial technical direction

- Status: accepted for the demo bootstrap; persistence and charting remain open
- Date: 2026-11-19

## Context

The product specification proposes TypeScript across the web and API, a demo-first read-only MVP, SQLite for a small self-hosted installation, and a provider-neutral boundary. The ENTSO-E token, actual query coverage, data reuse terms, chart library, and target self-hosted environment remain unvalidated.

## Decision

Adopt only these constraints for the first implementation step:

- The demo must run without provider credentials or external calls.
- Start with native Node.js ESM, built-in HTTP/filesystem APIs, static HTML/CSS/JavaScript, and `node:test`. There are no dependencies to install.
- Use a small single-package layout for the first vertical slice. Revisit TypeScript, React, and workspaces when the project has enough domain/UI complexity to justify a build toolchain.
- Use semantic HTML, responsive CSS, an SVG chart with a visible data-table alternative, and no chart dependency in the first slice.
- Keep provider integration behind an adapter and domain DTO boundary.
- Keep source-specific and normalized categories, source zones, timestamps, units, and quality explicit.
- Defer package manager, framework, chart library, database, polling cadence, and live provider implementation until their validation tasks are completed.

## Consequences

This avoids locking the project into unverified dependencies or implying that public data can be redistributed. The first increment is synthetic fixtures plus a thin health/data API and dashboard. The initial UI will prove the data path, not establish the final visualization library or live ingestion design.
