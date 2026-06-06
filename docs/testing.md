# Testing

## Main Test Command

Run all Node tests:

```bash
node --test tests/*.test.mjs
```

## Useful Local Checks

Start the server locally:

```bash
node --env-file=.env server.mjs
```

Open:

```text
http://localhost:4178/
http://localhost:4178/chat/
http://localhost:4178/admin/
```

Local Kick-style chat injector outside production:

```bash
curl -s -X POST http://localhost:4178/api/dev/kick-chat \
  -H 'content-type: application/json' \
  -d '{"author":"Local Tester","handle":"localtester","body":"local kick inject","sourceHandle":"marketbubble"}'
```

X chat local testing currently requires the Chrome extension to point at the backend being tested. Change extension URLs only for the test, then restore/deploy intentionally.

## What To Test When Changing Areas

- Source normalization: `tests/source-config.test.mjs`
- Admin profile editor: `tests/admin-profile-model.test.mjs`
- Server routes/contracts: `tests/server-contract.test.mjs`
- Kick webhook handling: `tests/kick-webhook.test.mjs`
- Twitch chat/API/emotes: `tests/twitch-*.test.mjs`
- Chat model/render contract: `tests/chat-*.test.mjs`

If behavior changes without a matching test, add or update the narrowest test that proves the new contract.
