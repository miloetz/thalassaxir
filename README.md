# Thalassaxir

A real-time ocean simulation that makes Elixir's concurrency and fault-tolerance visible.

Each wave, particle, and current in the ocean is a live Elixir process — thousands of them, running simultaneously on the BEAM. A bioluminescent deep-sea creature inhabits the ocean, its body is the supervisor tree. Its tentacles are supervision branches, its cells are worker processes. Kill a process and watch a cell go dark. Kill a branch and a tentacle goes limp. The creature heals itself — because that's what supervisors do.

Built with Elixir, Phoenix Channels, and Three.js.

**The ocean is the BEAM. The creature is the system. It never dies.**

## Prerequisites

- [Elixir](https://elixir-lang.org/install.html) ~> 1.15
- [PostgreSQL](https://www.postgresql.org/download/)
- Node.js (for asset compilation)

## Getting Started

1. Navigate to the project directory:
   ```bash
   cd thalassaxir
   ```

2. Install dependencies:
   ```bash
   mix setup
   ```

3. Start the Phoenix server:
   ```bash
   mix phx.server
   ```

   Or run inside IEx for interactive development:
   ```bash
   iex -S mix phx.server
   ```

4. Visit [`localhost:4000`](http://localhost:4000) in your browser.

## Development

Run the precommit checks before pushing:
```bash
mix precommit
```

This runs compilation with warnings-as-errors, formatting, and tests.
