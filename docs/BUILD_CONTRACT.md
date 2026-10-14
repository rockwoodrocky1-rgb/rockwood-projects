# Implementation reference

The initial build contract has been replaced by maintained guides so agents do not follow obsolete ownership assignments, endpoint limits or interface labels.

- [Root instructions](../AGENTS.md) and [documentation map](README.md)
- [Product and workflows](product/README.md)
- [Architecture and data model](architecture/README.md)
- [Agent connection](../agents/README.md) and [HTTP API](../agents/API.md)
- [Operations](operations/README.md) and [human handoff](operations/HUMAN-HANDOFF.md)

Current field/status definitions live in `lib/domain.ts`; database rules live in ordered `supabase/migrations/`; source coverage lives in `data/customer-requirements.json` and template tests. Use those files and live authenticated capabilities when implementing an action. Public showcase records are disposable memory; live records persist only through authenticated APIs.
