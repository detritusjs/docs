# Detritus Client

A wheels-attached, pure-TypeScript library for the Discord API. Connect shards, cache everything, run prefix and slash commands, and join voice, all from one package.

## Overview

`detritus-client` is the high-level package. It wraps the REST layer (`detritus-client-rest`) and the Gateway layer (`detritus-client-socket`) and turns raw payloads into cached, typed structures like `Structures.Message` and `Structures.Guild`.

You pick a client class depending on how big your bot is and what it does:

| Class | Use it when |
| --- | --- |
| `ShardClient` | You want a single gateway connection and its events. Every other client is built from these. |
| `ClusterClient` | You want several shards inside one process. It creates `ShardClient`s for you. |
| `CommandClient` | You want prefix commands like `!ping`. It wraps a `ClusterClient` (or a `ShardClient`). |
| `InteractionCommandClient` | You want slash commands and context menus. It also wraps a cluster or shard client. |
| `ClusterManager` | Your bot is big enough to need several processes, each running a `ClusterClient`. |

The two command clients can share one underlying client, so a bot can have prefix commands and slash commands at the same time.

## Installation

```bash
npm install detritus-client
```

The client needs **Node 22.19 or newer**. Its HTTP layer, `detritus-rest`, is built on undici and refuses to load on older versions.

Some features need optional packages. Install the ones you use:

| Package | What it enables |
| --- | --- |
| `@snazzah/davey` | Joining voice channels. Discord has required end-to-end encrypted voice (DAVE) since March 1st, 2026. |
| `@discordjs/opus` or `opusscript` | Encoding and decoding Opus audio for voice. |
| `sodium-native` or `libsodium-wrappers` | The `aead_xchacha20_poly1305_rtpsize` voice encryption fallback. |
| `erlpack` | The faster `etf` gateway encoding instead of JSON. |

> **Note**: Keep your bot token out of your source code. The examples here read it from `process.env.TOKEN`.

## Your first bot

A `ShardClient` is one connection to the gateway. Create it with your token, listen for events, then call `run()`.

```js
const { ShardClient } = require('detritus-client');

const client = new ShardClient(process.env.TOKEN, {
  gateway: {
    // fill the member cache for guilds bigger than the large threshold
    loadAllMembers: true,
  },
});

client.on('guildCreate', ({fromUnavailable, guild}) => {
  if (fromUnavailable) {
    console.log(`${guild.name} came back from an outage`);
  } else {
    console.log(`Joined ${guild.name}, now in ${client.guilds.length} guilds`);
  }
});

client.on('messageCreate', async ({message}) => {
  if (message.content === '!ping') {
    const reply = await message.reply('pong!, deleting this in 5 seconds...');
    setTimeout(() => reply.delete(), 5000);
  }
});

(async () => {
  await client.run();
  console.log(`Connected with ${client.guilds.length} guilds cached`);

  client.gateway.setPresence({
    activity: {name: 'with Detritus', type: 0},
    status: 'dnd',
  });
})();
```

`run()` fetches the gateway URL, connects, waits for the `READY` payload and resolves with the client. Structures like `Structures.Message` come with helpers for the endpoints that act on them, so `message.reply()`, `reply.delete()`, `guild.fetchMembers()` and so on map straight to REST calls.

## Events

Every client is an event emitter. Events are named in camelCase, like `messageCreate` or `guildMemberAdd`, and the listener always gets **one object** as its payload.

```ts
import { GatewayClientEvents, ShardClient } from 'detritus-client';

const client = new ShardClient(process.env.TOKEN!);

client.on('messageUpdate', ({differences, message}: GatewayClientEvents.MessageUpdate) => {
  if (message && differences && differences.content !== undefined) {
    console.log(`${message.author} edited a message: ${differences.content} -> ${message.content}`);
  }
});
```

- The payload type for every event is in the `GatewayClientEvents` namespace, and the list of event names is the `Constants.ClientEvents` enum.
- Update events include `differences`, an object holding the old values of whatever changed.
- On a `ClusterClient`, every payload also has a `shard` property: the `ShardClient` the event came from.
- `client.subscribe(name, listener)` works like `on()` but returns an `EventSubscription` you can `.remove()` later.

The gateway sends only what your **intents** allow. By default the client asks for every unprivileged intent. To add privileged ones like message content or members, turn them on in the developer portal, then pass them in:

```js
const client = new ShardClient(process.env.TOKEN, {
  gateway: {
    // 'ALL', 'ALL_UNPRIVILEGED', a bitfield, or a list of names/numbers
    intents: ['GUILDS', 'GUILD_MESSAGES', 'MESSAGE_CONTENT', 'GUILD_MEMBERS'],
  },
});
```

## Sharding with ClusterClient

Discord requires bots in 2,500+ guilds to shard. A `ClusterClient` runs a set of shards inside one process and forwards all of their events.

```js
const { ClusterClient } = require('detritus-client');

const cluster = new ClusterClient(process.env.TOKEN, {
  gateway: {
    presence: {activity: {name: 'with Detritus', type: 0}, status: 'dnd'},
  },
  // shardCount: 4,     leave out to use Discord's recommended count
  // shards: [0, 1],    which shard ids this process should run
});

cluster.on('messageCreate', async ({message, shard}) => {
  if (message.content === '!ping') {
    await message.reply(`pong from shard #${shard.shardId}!`);
  }
});

(async () => {
  await cluster.run();
  console.log(`Launched shards ${cluster.shardStart} to ${cluster.shardEnd} of ${cluster.shardCount}`);
})();
```

The shards live in `cluster.shards` once `run()` resolves. They're started one bucket at a time, following the session's `max_concurrency`.

## Multiple processes with ClusterManager

When one process isn't enough, a `ClusterManager` forks child processes and gives each a range of shards. The child file creates its client **without a token**; it reads the token and shard range from the environment the manager sets up.

```js run.js
const { ClusterManager } = require('detritus-client');

const manager = new ClusterManager('./child.js', process.env.TOKEN, {
  shardCount: 6,
  shardsPerCluster: 2,
});

(async () => {
  await manager.run();
  console.log('Running 3 clusters with 2 shards each');
})();
```

```js child.js
const { CommandClient } = require('detritus-client');

// no token here, the manager passes it to the fork
const commandClient = new CommandClient('', {prefix: '!!'});

commandClient.add({name: 'ping', run: (context) => context.reply('pong')});

(async () => {
  await commandClient.run();
})();
```

The child can be a `ClusterClient`, `CommandClient` or `InteractionCommandClient`. Point the manager at the **compiled** file if you write the child in TypeScript.

## Prefix commands

A `CommandClient` reads messages, matches a prefix and a command name, parses arguments and calls your `run` function with a `Command.Context`.

```js
const { CommandClient } = require('detritus-client');

const commandClient = new CommandClient(process.env.TOKEN, {
  prefix: '..',            // or prefixes: ['..', '!']
  // mentionsEnabled: true, also lets "@bot ping" work
});

commandClient.add({
  name: 'ping',
  run: (context) => context.reply('pong!'),
});

commandClient.add({
  name: 'echo',
  label: 'text',  // the text after the command name ends up in args.text
  args: [{name: 'reverse', type: 'bool', aliases: ['backwards']}],
  onBeforeRun: (context, args) => !!args.text,
  onCancelRun: (context) => context.reply('Give me something to echo.'),
  run: (context, args) => {
    const text = args.reverse ? args.text.split('').reverse().join('') : args.text;
    return context.editOrReply(text);
  },
});

commandClient.add({
  name: 'owner',
  // return false to stop the command, then onCancel is called
  onBefore: (context) => context.client.isOwner(context.userId),
  onCancel: (context) => context.reply('This command is only for the bot owner.'),
  run: (context) => context.reply('Hello, owner.'),
});

(async () => {
  const client = await commandClient.run();
  console.log(`Loaded with ${client.shardCount} shards`);
})();
```

Arguments are flags written as `-name value`. Each has a `type` (`'string'`, `'number'`, `'bool'`, or your own converter function), optional `default`, `choices` and `aliases`. When a conversion throws, `onTypeError` gets an object of errors keyed by argument name.

A command runs in this order: ratelimit check → DM and permission checks → `onBefore` → argument parsing → `onBeforeRun` → `run` → `onSuccess` (or `onRunError`). The paths that stop early call `onRatelimit`, `onPermissionsFail`, `onCancel`, `onTypeError` or `onCancelRun`, and `onError` catches anything else.

> **Tip**: Use `context.editOrReply()` instead of `context.reply()`. If the user edits their message, the command runs again and edits its earlier reply instead of sending a new one.

## Command classes and folders

For bigger bots, put each command in its own file and load the folder with `addMultipleIn()`. A file can export a plain options object or a class extending `Command.Command`.

```ts commands/roll.ts
import { Command, CommandClient } from 'detritus-client';

export interface CommandArgs {
  amount: number,
}

export default class RollCommand extends Command.Command {
  constructor(client: CommandClient, options: Command.CommandOptions) {
    super(client, {
      ...options,
      name: 'roll',
      label: 'amount',
      type: Number,
      default: 1,
      // only allow 1 to 20 rolls
      choices: Array.from({length: 20}, (value, key) => key + 1),
      help: 'Roll some dice, 1 to 20 at a time',
    });
  }

  run(context: Command.Context, args: CommandArgs) {
    const rolls = Array.from({length: args.amount}, () => Math.ceil(Math.random() * 100));
    return context.editOrReply(`Rolls: ${rolls.join(', ')}`);
  }
}
```

```ts run.ts
import { CommandClient } from 'detritus-client';

const commandClient = new CommandClient(process.env.TOKEN!, {prefix: '!!'});

(async () => {
  // paths are relative to the calling file
  await commandClient.addMultipleIn('./commands');
  await commandClient.run();
})();
```

A shared base class is a good place for handlers every command needs, like formatting `onTypeError` the same way everywhere.

## Slash commands

An `InteractionCommandClient` registers application commands with Discord and routes interactions to them. When it starts it compares your local commands with the ones Discord has and only uploads what changed.

```js
const { Constants, InteractionCommandClient } = require('detritus-client');
const { ApplicationCommandOptionTypes, ApplicationCommandTypes, MessageFlags } = Constants;

const interactionClient = new InteractionCommandClient(process.env.TOKEN);

interactionClient.add({
  name: 'ping',
  description: 'Ping!',
  run: (context) => context.editOrRespond('pong!'),
});

interactionClient.add({
  name: 'avatar',
  description: 'Show someone\'s avatar',
  options: [
    {
      name: 'user',
      description: 'Whose avatar to show',
      type: ApplicationCommandOptionTypes.USER,
      // defaults can be functions of the context
      default: (context) => context.member || context.user,
    },
  ],
  run: (context, args) => context.editOrRespond(args.user.avatarUrl),
});

// right click a user > Apps > Poke
interactionClient.add({
  name: 'Poke',
  type: ApplicationCommandTypes.USER,
  run: (context, args) => context.editOrRespond({
    content: `You poked ${args.member || args.user}`,
    flags: MessageFlags.EPHEMERAL,
  }),
});

(async () => {
  const client = await interactionClient.run();
  console.log(`Loaded with ${client.shardCount} shards`);
})();
```

- Pass `guildIds: ['...']` to register a command in specific guilds instead of globally. Guild commands update instantly, which is handy while developing.
- Sub-commands and groups are options whose `type` is `SUB_COMMAND` or `SUB_COMMAND_GROUP`, or instances of `Interaction.InteractionCommandOption` with their own `run`.
- `context.editOrRespond()` responds the first time and edits the response after that. For slow work, call `context.respond(InteractionCallbackTypes.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE)` first.
- `addMultipleIn('./commands')` works here too, with classes extending `Interaction.InteractionCommand`.

The same hooks as prefix commands exist (`onBefore`, `onCancel`, `onRunError`, `onValueError`, ...), plus `permissions` / `permissionsClient` checks and `onDmBlocked` for `disableDm` commands.

## Buttons, menus and modals

Components can carry their own `run` callbacks. Detritus keeps a listener for the message, so you don't need to match `custom_id`s by hand. `Utils.Components` holds the rows, and `Utils.ComponentActionRow` builds a single row.

```js
const { Utils } = require('detritus-client');
const { Components } = Utils;

interactionClient.add({
  name: 'click-test',
  description: 'Click a button',
  run: (context) => {
    const components = new Components({
      timeout: 5 * 60 * 1000,
      onTimeout: () => context.editOrRespond({content: 'Nobody clicked in time.', components: []}),
    });

    components.createButton({
      label: 'Click me',
      run: (componentContext) => componentContext.editOrRespond({
        content: `Clicked by ${componentContext.user}`,
        components: [],
      }),
    });

    return context.editOrRespond({content: 'Click the button', components});
  },
});
```

Select menus work the same way with `createSelectMenu()`, and the picked values are in `componentContext.data.values`.

Modals use `Utils.InteractionModal`. Respond with the modal itself and its `run` gets the submitted text inputs, keyed by each input's `customId`:

```ts
import { Utils } from 'detritus-client';

const modal = new Utils.InteractionModal({
  title: 'Quick survey',
  timeout: 5 * 60 * 1000,
  run: (modalContext, args) => modalContext.createMessage(`Birds: ${args.birds}, cats: ${args.cats}`),
});
modal.createInputText({customId: 'birds', label: 'Do you like birds?', required: true});
modal.createInputText({customId: 'cats', label: 'Do you like cats?', required: true});

return context.respond(modal);
```

## Embeds and markup

`Utils.Embed` builds embeds with chainable setters, and `Utils.Markup` formats and escapes text.

```js
const { Utils } = require('detritus-client');
const { Embed, Markup } = Utils;

const embed = new Embed();
embed.setTitle('Server info');
embed.setColor(0x5865f2);
embed.setDescription(Markup.bold(guild.name));
embed.addField('Members', String(guild.memberCount), true);
embed.setThumbnail(guild.iconUrl);
embed.setTimestamp();

await message.reply({embed});

// escaping user input before putting it in a message
await message.reply(`You said: ${Markup.escape.all(message.content)}`);
await message.reply(Markup.codeblock(JSON.stringify(data, null, 2), {language: 'json'}));
```

Most send methods take an `embed`, an `embeds` array, `components`, `files` and `allowedMentions` alongside `content`.

## Caching

Every structure the gateway sends is cached in a collection on the client: `client.guilds`, `client.channels`, `client.members`, `client.messages`, `client.users` and so on. Collections are `Map`-like (`get`, `has`, `filter`, `find`, `map`, `first`, `length`...).

Each cache can be turned off or tuned with `cache` options. A cache option is either a boolean or `{enabled, expire, limit}`:

```js
const client = new ShardClient(process.env.TOKEN, {
  cache: {
    messages: {expire: 30 * 60 * 1000},  // keep messages for 30 minutes (default is 10)
    presences: false,                    // don't store presences at all
    users: {limit: 50000},               // evict the least recently used past 50k
  },
});
```

Pass `cache: false` to disable every cache, useful for a bot that only answers interactions. Structures still work without the cache; you'll just need to fetch what you need, like `client.rest.fetchGuild(guildId)`.

## Voice

Join a channel with `client.voiceConnect()` (or `channel.join()` on a voice channel). You get back the `VoiceConnection` and whether it's new or was reused.

```js
const voice = await client.voiceConnect(guildId, channelId, {receive: true});
if (!voice) {
  throw new Error('Could not join the channel');
}
const { connection, isNew } = voice;
if (isNew) {
  connection.setSpeaking({voice: true});
  // send a silence frame so Discord starts sending us audio
  connection.sendAudioSilenceFrame();
  connection.on('packet', ({data, userId}) => {
    if (userId === targetUserId) {
      connection.sendAudio(data, {isOpus: true});
    }
  });
}
```

Voice needs `@snazzah/davey` for DAVE end-to-end encryption, and an Opus package to encode or decode audio. `AudioMixer` can mix decoded audio from several users into one PCM stream. Call `connection.kill()` to leave.

## Going lower level

Everything the high-level client does is available underneath it:

- `client.rest` is a REST client with the same methods as `detritus-client-rest`'s `Client` (like `createMessage` or `fetchGuild`), but it returns structures instead of raw objects. The raw client is at `client.rest.raw`.
- `client.gateway` is the `detritus-client-socket` gateway connection, for things like `setPresence()` or `requestGuildMembers()`.
- `GatewayRawEvents` describes the raw payloads, before they're turned into structures.

Read the [Client Rest]({{base}}client-rest/) and [Client Socket]({{base}}client-socket/) docs for those layers.
