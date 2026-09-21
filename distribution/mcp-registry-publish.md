# Publishing daydeck-mcp to npm and the official MCP Registry

Prepared 2026-09-21. Everything below was dry-run or read-only this session — no
`npm publish`, no `mcp-publisher login`/`publish` was run (not logged in yet on
either side). Run the commands yourself, in order, when ready.

## What's already done (this session)

- `integrations/daydeck-mcp/package.json`: name `daydeck-mcp`, version `0.1.0`,
  `bin`, trimmed `files`, `repository`/`homepage`/`bugs`/`keywords`/`license`/
  `engines`, and an `mcpName` field (see the namespace-case note below).
- `integrations/daydeck-mcp/server.js` made executable (`chmod +x`); it already
  starts with `#!/usr/bin/env node`.
- `integrations/daydeck-mcp/LICENSE` copied in from `integrations/LICENSE` (MIT)
  so it ships inside the npm tarball.
- `integrations/daydeck-mcp/README.md`: new "Install with npx" section at the
  top of Install (Claude Desktop config, `claude mcp add`, Cursor config).
- `integrations/daydeck-mcp/server.json` written for the MCP Registry.
- `mcp-publisher` 1.8.1 installed via `brew install mcp-publisher` and
  `mcp-publisher validate server.json` passes against the live registry schema.
- `npm test` (31/31) and `npm pack --dry-run` (8 files, 80.7 kB / 124.6 kB
  unpacked — no `node_modules`, `test/`, `dist/`, or `.mcpb`) both pass.

## Important: the namespace case issue

The task brief suggested `io.github.krnic-commv` (lowercase). **That will not
authorize.** I read the registry's Go source
(`internal/api/handlers/v0/auth/github_at.go` and `internal/auth/jwt.go`) to
check how it matches names, since the docs don't spell this out:

- GitHub OAuth login grants a permission pattern built from `org.Login` **exactly
  as GitHub's API returns it** — no `strings.ToLower`.
- The permission check (`isResourceMatch` in `internal/auth/jwt.go`) is a plain
  `strings.HasPrefix` — **case-sensitive**, no case-folding.
- I queried `GET https://api.github.com/orgs/Krnic-CommV` (and the lowercase
  variant): the org's canonical `login` is `Krnic-CommV`, mixed case, regardless
  of how you query it.

So a GitHub-authenticated publish only succeeds under the exact-case namespace
**`io.github.Krnic-CommV`**. I used that case in both `package.json`'s
`mcpName` and `server.json`'s `name` — they must match each other exactly, and
`mcp-publisher validate` confirms the schema itself allows mixed case
(`pattern": "^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$"`, no case restriction). If you'd
rather publish as all-lowercase, that's only possible via the DNS-namespace
route (see below), not GitHub org auth.

Also confirmed while in there: **org namespaces require you to be an Owner**
(role `admin`) of Krnic-CommV, not just a member — the registry checks your
GitHub org membership role, not just membership. If you're not currently an
Owner of Krnic-CommV, promote your own account first or the org-scoped login
will silently fall back to your personal `io.github.<you>/*` namespace only.

## Order of operations

### 1. Log in to npm and publish the package

```bash
cd /Users/tomislavkrnic/Documents/MyWay/Daydeck/integrations/daydeck-mcp
npm login
npm publish --access public
```

- `npm login` opens a browser (or prompts for username/password/OTP) — the
  package name `daydeck-mcp` is unscoped and currently unclaimed on the npm
  registry (verified: `https://registry.npmjs.org/daydeck-mcp` → "Not found"),
  so `--access public` isn't strictly required for an unscoped name but is
  harmless to include.
- Verify: open `https://www.npmjs.com/package/daydeck-mcp` and confirm version
  `0.1.0` is listed, or run `npm view daydeck-mcp version`.

### 2. Log in to the MCP Registry (GitHub device flow)

```bash
cd /Users/tomislavkrnic/Documents/MyWay/Daydeck/integrations/daydeck-mcp
mcp-publisher login github
```

What you'll see:

```
Logging in with github...

To authenticate, please:
1. Go to: https://github.com/login/device
2. Enter code: ABCD-1234
3. Authorize this application
Waiting for authorization...
```

Open the link, enter the code, authorize. Terminal then prints:

```
Successfully authenticated!
✓ Successfully logged in
```

This grants your personal `io.github.<you>/*` namespace automatically, plus
`io.github.Krnic-CommV/*` **only if** your GitHub account is an Owner of the
Krnic-CommV organization at the moment you log in (see the case note above).

### 3. Publish to the registry

```bash
cd /Users/tomislavkrnic/Documents/MyWay/Daydeck/integrations/daydeck-mcp
mcp-publisher publish
```

(`publish` reads the registry URL from the token `login` saved — don't pass a
`--registry` flag, it would be parsed as a `server.json` path instead.)

Expected output:

```
Publishing to https://registry.modelcontextprotocol.io...
✓ Successfully published
✓ Server io.github.Krnic-CommV/daydeck version 0.1.0
```

If you instead see `"Registry validation failed for package"`, it almost
always means the npm package's `mcpName` doesn't match `server.json`'s `name`,
or step 1 hasn't propagated yet (registry.npmjs.org can take a minute).

If you see `"You do not have permission to publish this server"`, it's the
Owner-role issue above — the error message itself will list exactly which
namespaces your token is actually authorized for.

### 4. Verify

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.Krnic-CommV/daydeck"
```

Expect a JSON body containing `"name":"io.github.Krnic-CommV/daydeck"`,
`"version":"0.1.0"`, and the npm package entry. You can also browse
`https://registry.modelcontextprotocol.io/v0.1/servers?search=daydeck` for a
looser search.

## Alternative: DNS-namespace route (`be.krnic/daydeck`, no GitHub auth)

Checked this session, not acted on:

```
$ dig NS krnic.be +short
sam.ns.cloudflare.com.
uma.ns.cloudflare.com.

$ dig TXT krnic.be +short
"v=spf1 include:_spf.google.com -all"
"apple-domain-verification=LEQOYbsfHoXvkoEI"
"google-site-verification=..." (x3)
"hosting-site=krnic-commv"
```

`krnic.be` is on **Cloudflare DNS** (both nameservers are Cloudflare's). If you'd
rather not depend on GitHub org-owner status, `mcp-publisher login dns` (see
`docs/modelcontextprotocol-io/authentication.mdx` in the registry repo) lets you
prove ownership of `krnic.be` with an Ed25519/ECDSA keypair and a TXT record at
the domain **apex** (not a `_mcp-auth.` subdomain — the registry only checks the
apex). That would let you publish as `be.krnic/daydeck` (reverse-DNS namespace,
any case you like, since you own the whole domain) instead of
`io.github.Krnic-CommV/daydeck`. Trade-off: it's a manual TXT record to add and
remember to rotate/remove in Cloudflare, versus the GitHub route which just
needs Owner status on an org you already control. Not changed — this is a
report only, per instructions.

## Files touched this session

- `integrations/daydeck-mcp/package.json`
- `integrations/daydeck-mcp/server.js` (chmod +x only, no content change)
- `integrations/daydeck-mcp/LICENSE` (new, copied from `integrations/LICENSE`)
- `integrations/daydeck-mcp/README.md`
- `integrations/daydeck-mcp/server.json` (new)
- `integrations/distribution/mcp-registry-publish.md` (this file)
