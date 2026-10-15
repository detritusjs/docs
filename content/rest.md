# Detritus Rest

A small HTTP client built on undici's `fetch`, with route templates, base URLs, JSON and multipart bodies, and request timeouts.

## Overview

`detritus-rest` is the HTTP layer under `detritus-client-rest`, but there's nothing Discord-specific about it. Use it anywhere you want a little more structure than plain `fetch`:

- **A `Client`** that holds a base URL and default headers, with `get`, `post`, `put`, `patch`, `delete`, `head` and `options` helpers.
- **Routes** like `/users/:userId`, filled in from `params` and URI-encoded for you.
- **Bodies** are JSON-encoded automatically. Add `files` (or `multipart: true`) and the request becomes `multipart/form-data`.
- **Timeouts** that cover the whole request, including reading the body.
- **Reusable requests**: build a `Request` once and `send()` it again, the encoded body is cached.

## Installation

```bash
npm install detritus-rest
```

It requires **Node 22.19 or newer**, and throws on import on anything older.

## Making requests

`client.request()` takes a URL or an options object and resolves with a `Response`. Read the body with `json()`, `text()`, `buffer()` or `arrayBuffer()`.

```ts
import { Client } from 'detritus-rest';

const client = new Client();

(async () => {
  const response = await client.request('https://nghttp2.org/httpbin/get');
  const body = await response.json();
  console.log(response.statusCode, body);
})();
```

```js
const { Client } = require('detritus-rest');

const client = new Client();

(async () => {
  const response = await client.request('https://nghttp2.org/httpbin/get');
  const body = await response.json();
  console.log(response.statusCode, body);
})();
```

> **Note**: Like `fetch`, a request only rejects on network errors and timeouts. A `404` or `500` still resolves, so check `response.ok` or `response.statusCode`.

The method helpers set the method for you:

```js
await client.get('https://nghttp2.org/httpbin/get', {query: {page: 2}});
await client.delete({url: 'https://nghttp2.org/httpbin/delete'});
```

## Base URLs and routes

Give the client a `baseUrl` and pass a `path`, or a `route` whose `:params` get filled in:

```js
const client = new Client({
  baseUrl: 'https://nghttp2.org',
  headers: {'user-agent': 'my-app (1.0.0)'},
});

// GET https://nghttp2.org/httpbin/get
await client.request({path: '/httpbin/get'});

// GET https://nghttp2.org/httpbin/anything/some%20value
await client.request({
  route: {
    method: 'get',
    path: '/httpbin/anything/:value',
    params: {value: 'some value'},
  },
});
```

The `Route` is kept on the request as `request.route`, which is how `detritus-client-rest` groups requests into ratelimit buckets by their path template.

## Request bodies

A plain object or array `body` is sent as JSON. Strings, `Buffer`s, `Blob`s, `URLSearchParams` and streams are sent as-is.

```js
// application/json
await client.post({
  url: 'https://nghttp2.org/httpbin/post',
  body: {some: 'json'},
});

// multipart/form-data, each key becomes a field
await client.post({
  url: 'https://nghttp2.org/httpbin/post',
  body: {some: 'multipart data'},
  multipart: true,
});

// files, with the rest of the body sent as a `payload_json` field
await client.post({
  url: 'https://nghttp2.org/httpbin/post',
  body: {content: 'hello'},
  files: [
    {key: 'file', filename: 'notes.txt', contentType: 'text/plain', value: 'file contents'},
  ],
});
```

A file's `value` can be a string, `Buffer`, `Blob` or a readable stream; streams are read in when the request is first sent. When sending files, set `multipart: true` (or `jsonify: false`) to append the body's keys as separate form fields instead of one `payload_json` field.

## Timeouts and aborting

`timeout` (in milliseconds) aborts the request if it, or reading its body, takes too long. It rejects with a `TimeoutError`. You can also pass your own `signal`:

```ts
try {
  const response = await client.get('https://nghttp2.org/httpbin/delay/10', {timeout: 2000});
  await response.json();
} catch (error: any) {
  console.log(error.name); // 'TimeoutError'
}
```

```js
try {
  const response = await client.get('https://nghttp2.org/httpbin/delay/10', {timeout: 2000});
  await response.json();
} catch (error) {
  console.log(error.name); // 'TimeoutError'
}
```

## Building requests yourself

`client.createRequest()` returns a `Request` without sending it, so you can inspect or reuse it. It merges in the client's base URL, headers and dispatcher.

```js
const request = client.createRequest({
  method: 'post',
  path: '/httpbin/post',
  body: {hello: 'world'},
});

console.log(request.method, request.url.href); // POST https://nghttp2.org/httpbin/post
const first = await request.send();
const second = await request.send(); // same body, sent again
```

To use a custom undici `Agent` or `Pool` (for keep-alive tuning or a proxy), pass it as `dispatcher` on the client or on a single request.
