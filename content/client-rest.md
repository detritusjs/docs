# Detritus Client Rest

A pure-TypeScript library for just Discord's REST API. Every endpoint is a method, and ratelimits are handled for you.

## Overview

`detritus-client-rest` is a thin, complete wrapper over Discord's HTTP API. It's what `detritus-client` uses under the hood, and it works on its own when you don't need a gateway connection: in scripts, web dashboards, serverless interaction handlers or cron jobs.

- **One method per endpoint**, like `createMessage`, `fetchGuild` or `editGuildMember`. Methods return the raw JSON objects Discord sends back.
- **Ratelimits are automatic.** Requests are queued per route bucket and retried after a `429`, including global and shared limits.
- **Client-side checks** catch obviously invalid arguments before a request is ever sent.
- **Endpoint constants** in `Endpoints` give you every route path and CDN URL builder.

## Installation

```bash
npm install detritus-client-rest
```

It needs **Node 22.19 or newer**, since it sends requests through `detritus-rest` (undici).

## Making requests

Create a `Client` with your token and call methods on it:

```ts
import { Client } from 'detritus-client-rest';

const client = new Client(process.env.TOKEN!);

(async () => {
  const user = await client.fetchUser('300505364032389122');
  console.log(user.username);

  const message = await client.createMessage(channelId, 'Hello!');
  setTimeout(() => client.deleteMessage(channelId, message.id), 5000);
})();
```

```js
const { Client } = require('detritus-client-rest');

const client = new Client(process.env.TOKEN);

(async () => {
  const user = await client.fetchUser('300505364032389122');
  console.log(user.username);

  const message = await client.createMessage(channelId, 'Hello!');
  setTimeout(() => client.deleteMessage(channelId, message.id), 5000);
})();
```

Most methods take ids first and an options object last. Option names are camelCase and are converted to Discord's snake_case for you:

```js
await client.createMessage(channelId, {
  content: 'Some message',
  embed: {description: 'A custom embed!'},
  allowedMentions: {parse: []},
});

await client.editGuildMember(guildId, userId, {
  nick: 'New nickname',
  reason: 'Shows up in the audit log',
});
```

> **Note**: Tokens are sent as `Bot <token>` by default. Pass `authType: 'BEARER'` for OAuth2 access tokens, or `authType: 'USER'` to send the token as-is.

## Files and attachments

Upload files with `file` or `files`. A file's `value` can be a `Buffer`, a string, or a readable stream.

```ts
import * as fs from 'fs';

await client.createMessage(channelId, {
  content: 'Here are your files',
  file: {filename: 'file.txt', value: Buffer.from('Some file content')},
  files: [
    {filename: 'image.png', value: fs.createReadStream('./image.png')},
  ],
});
```

```js
const fs = require('fs');

await client.createMessage(channelId, {
  content: 'Here are your files',
  file: {filename: 'file.txt', value: Buffer.from('Some file content')},
  files: [
    {filename: 'image.png', value: fs.createReadStream('./image.png')},
  ],
});
```

When files are attached, the rest of the options are sent as `payload_json` alongside them.

## Paginating

Fetch methods take Discord's paging options. To read a whole channel, keep asking for the next page until one comes back empty:

```js
let messages = [];
let after = '0';
while (true) {
  const page = await client.fetchMessages(channelId, {after, limit: 100});
  if (!page.length) {
    break;
  }
  messages = [...page, ...messages];
  after = page[0].id;
}
// messages is now every message in the channel, newest first
```

## Ratelimits and errors

The client tracks ratelimit buckets from Discord's headers and waits automatically. You can change how it reacts:

| Option | Default | What it does |
| --- | --- | --- |
| `errorOnRatelimit` | `false` | Throw on a `429` instead of waiting and retrying. |
| `errorOnRatelimitIfMoreThan` | `0` | Only throw if the wait would be longer than this many milliseconds. |
| `haltOnUnauthorized` | `false` | Stop sending requests after a `401`, so a revoked token doesn't get your IP banned. |
| `bucketsExpireIn` | 1 hour | How long to remember a route's bucket. |
| `clientsideChecks` | `true` | Validate arguments before sending. |

A failed request rejects with an `HTTPError`. When Discord sent a JSON error body, it's a `DiscordHTTPError` with Discord's error `code`, the per-field `errors`, the `raw` body and the `response`:

```ts
try {
  await client.fetchMessage(channelId, '1');
} catch (error: any) {
  if (error.response) {
    console.log(error.response.statusCode); // 404
    console.log(error.code);                // 10008, "Unknown Message"
    console.log(error.errors);              // field-level errors, for 400s
  }
}
```

```js
try {
  await client.fetchMessage(channelId, '1');
} catch (error) {
  if (error.response) {
    console.log(error.response.statusCode); // 404
    console.log(error.code);                // 10008, "Unknown Message"
    console.log(error.errors);              // field-level errors, for 400s
  }
}
```

Discord bans IPs that send too many invalid requests (`401`, `403` and `429`) in 10 minutes. The client counts them and emits `invalidRequestWarning` as you get close to the limit.

## Events

The client is an event emitter. Use these events for logging and metrics:

```js
client.on('request', ({request, restRequest}) => {
  // `request` is the detritus-rest Request, `restRequest` is this library's wrapper
});

client.on('response', ({response, restRequest}) => {
  const route = response.request.route ? response.request.route.path : response.request.url;
  console.log(`${response.statusCode} ${route} (${response.took}ms)`);
});

client.on('ratelimited', ({global, retryAfter, scope}) => {
  console.warn(`Ratelimited for ${retryAfter}ms (global: ${global}, scope: ${scope})`);
});
```

Payload shapes are in `RestClientEvents`, and the event names are in `Constants.RestEvents`.

## Custom requests

For anything without a method, call `request()` with a route. Using a route instead of a full URL keeps ratelimit bucketing correct, because the bucket is keyed on the path template, not the filled-in ids.

```ts
import { Client, Endpoints } from 'detritus-client-rest';

const client = new Client(process.env.TOKEN!);

const message = await client.request({
  body: {content: 'Sent with a custom request'},
  route: {
    method: 'post',
    path: Endpoints.Api.CHANNEL_MESSAGES, // '/channels/:channelId/messages'
    params: {channelId},
  },
});
```

```js
const { Client, Endpoints } = require('detritus-client-rest');

const client = new Client(process.env.TOKEN);

const message = await client.request({
  body: {content: 'Sent with a custom request'},
  route: {
    method: 'post',
    path: Endpoints.Api.CHANNEL_MESSAGES, // '/channels/:channelId/messages'
    params: {channelId},
  },
});
```

`request()` also takes `query`, `headers`, `files`, `useAuth: false` (to skip the `Authorization` header) and `dataOnly: false` (to get the raw `Response` instead of the parsed body).

## Endpoints and CDN URLs

`Endpoints` holds every path the client uses, plus helpers for building links:

```ts
import { Endpoints } from 'detritus-client-rest';

Endpoints.Api.CHANNEL_MESSAGES;              // '/channels/:channelId/messages'
Endpoints.CDN.URL + Endpoints.CDN.AVATAR(userId, avatarHash, 'png');
Endpoints.Routes.URL + Endpoints.Routes.MESSAGE(guildId, channelId, messageId);
```

```js
const { Endpoints } = require('detritus-client-rest');

Endpoints.Api.CHANNEL_MESSAGES;              // '/channels/:channelId/messages'
Endpoints.CDN.URL + Endpoints.CDN.AVATAR(userId, avatarHash, 'png');
Endpoints.Routes.URL + Endpoints.Routes.MESSAGE(guildId, channelId, messageId);
```

URL builder arguments are URI-encoded for you. `Endpoints.Api.URL_STABLE` and `Endpoints.Api.PATH` (the versioned `/api/vN`) make up the default base URL.
