# Detritus Utils

The small building blocks shared by every Detritus package: collections, event emitters, snowflakes and timers.

## Overview

`detritus-utils` has no Discord-specific behavior and very few dependencies, so it's useful on its own too.

| Export | What it is |
| --- | --- |
| `BaseCollection` | A `Map` with array-style helpers, an optional size limit (LRU) and optional expiry. |
| `BaseSet` | A `Set` with the same array-style helpers. |
| `EventSpewer` | Node's `EventEmitter` with removable subscriptions. |
| `Snowflake` | Generate and take apart Discord-style snowflake ids. |
| `Timers` | `Timeout` and `Interval` wrappers that can be restarted, plus `sleep()`. |
| `Tools` | Small helpers like `guildIdToShardId()`. |

## Installation

```bash
npm install detritus-utils
```

## Collections

`BaseCollection` is a `Map` plus the array methods you keep reaching for: `filter`, `find`, `map`, `some`, `every`, `reduce`, `sort`, `first`, `toArray`, and a `length` property.

```js
const { BaseCollection } = require('detritus-utils');

const users = new BaseCollection();
users.set('1', {id: '1', name: 'cake'});
users.set('2', {id: '2', name: 'dan'});

users.find((user) => user.name === 'dan');   // {id: '2', ...}
users.map((user) => user.name);              // ['cake', 'dan']
users.length;                                // 2
```

Give it a `limit` to cap its size. Setting a new key past the limit evicts the least recently used entries:

```js
const recent = new BaseCollection({limit: 1000});
```

Give it an `expire` time (in milliseconds) and entries that haven't been used in that long are removed by a background interval. The interval starts when items are added and stops when the collection is cleared.

```js
const sessions = new BaseCollection({expire: 5 * 60 * 1000});
sessions.set(token, session);
sessions.get(token); // reading an entry counts as using it
```

`getOrInsert(key, value)` and `getOrInsertComputed(key, () => value)` return the existing value or store a new one. `BaseSet` has the same helpers for sets.

## Event emitters

`EventSpewer` is an event emitter whose `subscribe()` returns an `EventSubscription`. Removing a subscription is easier than keeping a reference to the listener around:

```js
const { EventSpewer } = require('detritus-utils');

class Thing extends EventSpewer {}

const thing = new Thing();
const subscription = thing.subscribe('update', (payload) => console.log(payload));

thing.emit('update', {value: 1});
subscription.remove();

// or drop every subscription at once
thing.removeAllSubscriptions();
```

Every Detritus client, socket and REST client is an `EventSpewer`, so this works on all of them.

## Snowflakes

Snowflakes are Discord's ids: a timestamp plus worker, process and sequence numbers packed into a 64-bit integer. `Snowflake` works with them as strings.

```js
const { Snowflake } = require('detritus-utils');

Snowflake.timestamp('175928847299117063');   // 1462015105796, ms since 1970
new Date(Snowflake.timestamp(message.id));   // when the message was sent

Snowflake.deconstruct('175928847299117063');
// {id, timestamp, workerId, processId, sequence}

// make an id for a point in time, handy for `before`/`after` paging
Snowflake.generate({timestamp: Date.now() - 24 * 60 * 60 * 1000}).id;
```

Every function takes an `epoch` option for snowflakes that aren't Discord's. The default is `Constants.DISCORD_SNOWFLAKE_EPOCH` (2015-01-01).

## Timers

`Timers.Timeout` and `Timers.Interval` wrap `setTimeout` and `setInterval` so they can be stopped and restarted without keeping track of handles:

```js
const { Timers } = require('detritus-utils');

const timeout = new Timers.Timeout();
timeout.start(5000, () => console.log('5 seconds passed'));
timeout.start(1000, () => console.log('restarted, only 1 second now'));
timeout.stop();

const interval = new Timers.Interval();
interval.start(1000, () => console.log('tick'));
interval.unref(); // don't keep the process alive just for this

await Timers.sleep(250);
```

## Tools

```js
const { Tools } = require('detritus-utils');

// which shard a guild's events come in on
Tools.guildIdToShardId('175928847299117063', 16); // 4
```

`Tools.URIEncodeWrap()` wraps an object of URL-building functions so every argument is URI-encoded, and is how `detritus-client-rest`'s endpoints are built.
