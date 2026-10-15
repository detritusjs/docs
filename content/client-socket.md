# Detritus Client Socket

A pure-TypeScript, low-level wrapper for Discord's Gateway and Voice connections.

## Overview

`detritus-client-socket` handles the websocket side of Discord: identifying, heartbeating, resuming, compression, and the voice gateway with its UDP transport. It hands you raw packets and leaves caching and structures to you (or to `detritus-client`, which is built on it).

| Export | What it is |
| --- | --- |
| `Gateway.Socket` | A connection to the main gateway. Emits every dispatch as a raw packet. |
| `Media.Socket` | A connection to a voice server's gateway, created by `voiceConnect()`. |
| `MediaUdp.Socket` | The UDP transport that sends and receives encrypted audio and video. |
| `MediaMixer.AudioMixer` | Mixes decoded PCM from several users into one stream. |
| `Constants` | Opcodes, intents, close codes, activity types and more. |

## Installation

```bash
npm install detritus-client-socket
```

Optional packages add features:

| Package | What it enables |
| --- | --- |
| `@snazzah/davey` | **Required for voice.** Discord has required end-to-end encryption (DAVE) since March 1st, 2026. |
| `sodium-native` or `libsodium-wrappers` | The `aead_xchacha20_poly1305_rtpsize` voice encryption fallback. The default `aead_aes256_gcm_rtpsize` is built into Node. |
| `erlpack` | The `etf` encoding, which is smaller and faster to decode than JSON. |
| `bufferutil` | Faster masking of the frames `ws` sends, `ws` picks it up automatically. |

## Connecting to the gateway

Create a `Gateway.Socket` with your token and options, then `connect()` to a gateway URL.

```ts
import { Constants, Gateway } from 'detritus-client-socket';

const socket = new Gateway.Socket(process.env.TOKEN!, {
  intents: ['GUILDS', 'GUILD_MESSAGES', 'MESSAGE_CONTENT'],
  presence: {
    activity: {name: 'something cool', type: Constants.GatewayActivityTypes.WATCHING},
    status: Constants.GatewayPresenceStatuses.DND,
  },
});

socket.on('ready', () => console.log('ready'));
socket.on('packet', (packet) => {
  if (packet.t === Constants.GatewayDispatchEvents.MESSAGE_CREATE) {
    console.log(`${packet.d.author.username}: ${packet.d.content}`);
  }
});
socket.on('close', ({code, reason}) => console.log('closed', code, reason));
socket.on('warn', console.error);

socket.connect('wss://gateway.discord.gg/');
```

```js
const { Constants, Gateway } = require('detritus-client-socket');

const socket = new Gateway.Socket(process.env.TOKEN, {
  intents: ['GUILDS', 'GUILD_MESSAGES', 'MESSAGE_CONTENT'],
  presence: {
    activity: {name: 'something cool', type: Constants.GatewayActivityTypes.WATCHING},
    status: Constants.GatewayPresenceStatuses.DND,
  },
});

socket.on('ready', () => console.log('ready'));
socket.on('packet', (packet) => {
  if (packet.t === Constants.GatewayDispatchEvents.MESSAGE_CREATE) {
    console.log(`${packet.d.author.username}: ${packet.d.content}`);
  }
});
socket.on('close', ({code, reason}) => console.log('closed', code, reason));
socket.on('warn', console.error);

socket.connect('wss://gateway.discord.gg/');
```

The socket reconnects and resumes on its own (`autoReconnect`, on by default). Call `socket.kill()` to close it for good.

## Socket options

| Option | What it does |
| --- | --- |
| `intents` | `'ALL'`, `'ALL_UNPRIVILEGED'` (the default), a bitfield, or a list of `Constants.GatewayIntents` names or numbers. |
| `compress` | `true`, or a `Constants.CompressTypes` value: `zlib-stream` or `zstd-stream`. |
| `encoding` | `'json'` or `'etf'` (needs `erlpack`). |
| `shardId`, `shardCount` | Which shard this socket is. |
| `largeThreshold` | Member count above which guilds arrive without their offline members. |
| `presence` | The presence sent with the identify payload. |
| `disabledEvents` | Dispatch names to drop before they're emitted. |
| `reconnectDelay`, `reconnectMax` | How long to wait between reconnects and how many to try. |
| `onIdentifyCheck` | Called before identifying. Return `false` to hold off and call `socket.identify()` yourself later, for example to share the identify ratelimit across processes. |

## Sending gateway commands

The socket has methods for the gateway's client-to-server opcodes:

```js
// change the bot's status
socket.setPresence({status: 'idle', activity: {name: 'the logs', type: 3}});

// ask for members, they arrive as GUILD_MEMBERS_CHUNK packets
socket.requestGuildMembers(guildId, {query: 'ca', limit: 10});

// join, move or leave a voice channel (leave with a null channel id)
socket.voiceStateUpdate(guildId, channelId, {selfDeaf: true});
```

Anything else can be sent raw with `socket.send(op, data)`, using `Constants.GatewayOpCodes`.

## Voice

`voiceConnect()` sends the voice state update, waits for the voice server, and resolves with a `Media.Socket`. Its `transportReady` event fires with the `MediaUdp.Socket` once audio can flow.

```ts
import { Constants, Gateway } from 'detritus-client-socket';

const socket = new Gateway.Socket(process.env.TOKEN!, {compress: true});

socket.on('ready', async () => {
  const media = await socket.voiceConnect(guildId, channelId, {receive: true});
  if (!media) {
    throw new Error('Failed to join the voice channel');
  }
  media.on('warn', console.error);

  let isSetup = false;
  media.on('transportReady', (transport) => {
    media.sendSpeaking({voice: true});
    // a silence frame tells Discord to start sending us audio
    transport.sendAudioSilenceFrame();
    if (isSetup) {
      // fires again after reconnects, but the transport is reused
      return;
    }
    isSetup = true;

    // repeat one user's audio back into the channel
    transport.on('packet', (packet) => {
      if (packet.userId === repeatUserId && packet.rtp) {
        transport.sendAudioFrame(packet.data, {
          sequence: packet.rtp.header.sequence,
          timestamp: packet.rtp.header.timestamp,
        });
      }
    });
  });
});

socket.connect('wss://gateway.discord.gg/');
```

```js
const { Constants, Gateway } = require('detritus-client-socket');

const socket = new Gateway.Socket(process.env.TOKEN, {compress: true});

socket.on('ready', async () => {
  const media = await socket.voiceConnect(guildId, channelId, {receive: true});
  if (!media) {
    throw new Error('Failed to join the voice channel');
  }
  media.on('warn', console.error);

  let isSetup = false;
  media.on('transportReady', (transport) => {
    media.sendSpeaking({voice: true});
    // a silence frame tells Discord to start sending us audio
    transport.sendAudioSilenceFrame();
    if (isSetup) {
      // fires again after reconnects, but the transport is reused
      return;
    }
    isSetup = true;

    // repeat one user's audio back into the channel
    transport.on('packet', (packet) => {
      if (packet.userId === repeatUserId && packet.rtp) {
        transport.sendAudioFrame(packet.data, {
          sequence: packet.rtp.header.sequence,
          timestamp: packet.rtp.header.timestamp,
        });
      }
    });
  });
});

socket.connect('wss://gateway.discord.gg/');
```

Voice uses gateway v8 with the `aead_aes256_gcm_rtpsize` encryption mode. Received packets are already decrypted (and DAVE-decrypted); `packet.data` is Opus.

## Mixing audio

`MediaMixer.AudioMixer` takes decoded PCM from several users and emits one mixed 20ms frame at a time, in Discord's format (48kHz, stereo). Decode each user's Opus with their own decoder, push the PCM in, and encode the mix back out.

```ts
import { OpusEncoder } from '@discordjs/opus';
import { MediaMixer } from 'detritus-client-socket';

const mixer = new MediaMixer.AudioMixer();
const encoder = new OpusEncoder(mixer.format.sampleRate, mixer.format.channels);

// for every received packet: mixer.push(userId, decoder.decode(packet.data), packet.rtp.header.timestamp)
mixer.on('data', (frame: Buffer) => {
  transport.sendAudioFrame(encoder.encode(frame));
});
```

```js
const { OpusEncoder } = require('@discordjs/opus');
const { MediaMixer } = require('detritus-client-socket');

const mixer = new MediaMixer.AudioMixer();
const encoder = new OpusEncoder(mixer.format.sampleRate, mixer.format.channels);

// for every received packet: mixer.push(userId, decoder.decode(packet.data), packet.rtp.header.timestamp)
mixer.on('data', (frame) => {
  transport.sendAudioFrame(encoder.encode(frame));
});
```

The full version, with per-user decoders and silence handling, is in `examples/ts/voice-mix-repeat.ts` in the repository.
