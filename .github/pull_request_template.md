## Summary

<Brief description of the change. What and why, not how.>

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that changes existing behavior)
- [ ] Documentation update
- [ ] CI / tooling / infrastructure
- [ ] Refactor (no functional change)

## Contract impact

- [ ] This PR adds or modifies a contract schema in `@inbox/contracts`
- [ ] This PR modifies a BFF route handler's request/response shape
- [ ] This PR modifies a UI fetcher in `api.ts`
- [ ] If you checked any of the above — the drift detection layers are updated (adapter-parity test, UI parsedGet/parsedPost)

## Testing

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (all workspace unit tests)
- [ ] `pnpm --filter @inbox/ui exec playwright test` passes (E2E, if UI changes)
- [ ] Added new tests where applicable

## Related

- Closes #...
- Depends on #...
- Related ADR: ...

## Checklist

- [ ] Branch name follows `<type>/issue-<N>-<slug>` convention
- [ ] Commit messages are conventional (`feat:`, `fix:`, `chore:`, etc.)
- [ ] No `as T` casts introduced in UI fetchers (use `parsedGet`/`parsedPost` from `lib/contract-fetch.ts`)
- [ ] Ports are allocated via `.world/ports.yml` if new dev services added (ADR 0003)
- [ ] `NEXT-SESSION.md` updated if this PR changes priorities or architecture
