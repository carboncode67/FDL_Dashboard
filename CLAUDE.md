# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Authoritative docs:

- [`README.md`](./README.md) in this folder — architecture, routes, API, database, and deployment for the FDL Dashboard.
- [`../README.md`](../README.md) at the workspace root — overview of how the FDL Dashboard and OFEDashBot fit together, plus launch instructions for both.

Next.js note: this project uses Next.js 16. Request interception lives in `proxy.ts` (the Next.js 16 replacement for `middleware.ts`), not `middleware.ts`. See [`AGENTS.md`](./AGENTS.md).
