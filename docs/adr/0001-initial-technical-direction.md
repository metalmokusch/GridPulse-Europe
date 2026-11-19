# ADR 0001: Initial technical direction

- Status: provisional
- Date: 2026-11-19

## Context

The product specification proposes TypeScript across the web and API, a demo-first read-only MVP, SQLite for a small self-hosted installation, and a provider-neutral boundary. The ENTSO-E token, actual query coverage, data reuse terms, chart library, and target OMV environment remain unvalidated.

## Decision

Adopt only these constraints for the first implementation step:

- The demo must run without provider credentials or external calls.
- Keep the UI and API in a small TypeScript-oriented structure unless bootstrap evidence favors a simpler setup.
- Keep provider integration behind an adapter and domain DTO boundary.
- Keep source-specific and normalized categories, source zones, timestamps, units, and quality explicit.
- Defer package manager, framework, chart library, database, polling cadence, and live provider implementation until their validation tasks are completed.

## Consequences

This avoids locking the project into unverified dependencies or implying that public data can be redistributed. The first code increment should be synthetic fixtures plus a thin health/data API and UI only after the package/licensing decisions are reviewed.
