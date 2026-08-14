# Testing notes

How tests are written in this repo, and why.

## Tests fix contracts, not implementations

A test earns its place by failing when the behaviour is wrong and staying green when
only the implementation changed. The rules below each come from a test here that failed to
do one of those — and was found by breaking the code and watching the suite stay green,
not by running it.

### 1. An assertion about *how* must name the contract it protects

A test that asserts a URL, a header, a request body, or the order of calls describes a
mechanism. Sometimes that is exactly right — the mechanism *is* the promise. When it
is, say so in a comment directly above the assertion.

`phone-login.test.ts` is the cautionary example. It asserted that the poll secret
appeared in the query string, under the belief that this protected "the secret reaches
the server". It protected the *transport*, and so acquired both failure modes at once:
moving the secret into a header — a strict improvement — turned it red, while it never
checked the thing that actually matters, which is that the secret is sent at all.

The contract needs two assertions, and they are different kinds of statement:

```ts
// Contract: the secret reaches the server.
expect(pollOpts?.headers).toMatchObject({ 'x-poll-secret': 'secret-xyz' });
// Invariant: never through the URL, which proxies, access logs and shell history
// all retain.
expect(polledUrl).not.toContain('secret-xyz');
```

### 2. An invariant covers every occurrence, not the first one

"Never" is a claim about all of them. The version of the rule above that checked only
`http.get.mock.calls[0]` left every retry unchecked — and a retry is the normal case
here, since the user is walking to their phone while the loop keeps polling. Assert
over the whole set of calls, and assert that there was more than one.

The same applies to state: a property like "this file is never group-readable" has to
be checked after every route that can produce the file, including migration from a
legacy path, not just after the first write.

### 3. A property over sequences needs a liveness assertion

"X never becomes false after being true" is satisfied trivially by an X that is never
true. An invariant of that shape must also assert that the state it guards actually
moves, or it passes on a build where the feature is simply broken.

The same trap catches any loop over a collection the code under test produced.
`for (const cmd of commands) expect(typeof cmd.name).toBe('string')` passes on an empty
list, and an empty list is what a broken traversal returns — so assert the collection is
non-empty first. A collection the *test* defines needs no such guard; it cannot be empty
by accident.

### 4. "Covered elsewhere" is a claim to be checked, not assumed

Before writing off a gap because another test surely catches it, break the behaviour and
run the whole suite. A unit test over a helper does not cover the caller that walks it: a
snapshot of `buildCommandSchema` left `numo schema` free to list no commands at all, and
`classifyApiBase` was tested thoroughly while nothing noticed the guard being removed from
the client that calls it.

Isolate before crediting, too — `vitest -t '<name>'`. A test can look like it holds a rule
when the failure actually comes from a neighbour in the same file, which means deleting the
neighbour silently stops the rule from being checked.

### 5. An assertion about rendered output must not measure the environment

Terminal output carries colour, box-drawing characters and unicode that depend on where it
runs, not on whether the code is right. `renderTable`'s columns were checked with
`line.length`, which passes locally and fails in CI, where colour is on and the bold header
carries escape sequences no reader sees. Strip them and measure what a reader perceives.

The same trap in a different shape got a `truncate` case deleted: it pinned a literal `…`,
which is `...` wherever the terminal has no unicode. If an assertion would change with the
terminal, it is describing the runner.

## The snapshots are review gates

`schema.test.ts` snapshots the full `numo schema` payload with `SCHEMA_VERSION` inside
it. When that snapshot fails, updating it is not the fix by itself. Either bump
`SCHEMA_VERSION` in `lib/schema.ts`, or be able to say why the change is additive
enough that an agent pinned to the old version still behaves correctly.

The version is inside the snapshot on purpose: a payload change cannot be approved
without the version appearing in the same diff.

`cli-output.test.ts` snapshots the command names from `numo commands --json` for the same
reason, and because a count threshold does not hold the rule: it passed with the list
truncated to six of twenty-two. Adding or removing a command has to show up in that diff.
