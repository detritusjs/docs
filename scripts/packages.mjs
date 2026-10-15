// the packages the site documents, in the order they show up in the switcher
// `dir` is relative to the folder that holds the docs folder (the detritusjs checkout)
export const PACKAGES = [
  {
    slug: 'client',
    dir: 'client',
    npm: 'detritus-client',
    repo: 'detritusjs/client',
    title: 'Client',
    tagline: 'The full library: shards, clusters, caching, commands and voice.',
    icon: 'bot',
  },
  {
    slug: 'client-rest',
    dir: 'client-rest',
    npm: 'detritus-client-rest',
    repo: 'detritusjs/client-rest',
    title: 'Client Rest',
    tagline: 'Every Discord REST endpoint, with ratelimit buckets handled for you.',
    icon: 'globe',
  },
  {
    slug: 'client-socket',
    dir: 'client-socket',
    npm: 'detritus-client-socket',
    repo: 'detritusjs/client-socket',
    title: 'Client Socket',
    tagline: 'Low-level Gateway and Voice connections, including DAVE.',
    icon: 'plug',
  },
  {
    slug: 'rest',
    dir: 'rest',
    npm: 'detritus-rest',
    repo: 'detritusjs/rest',
    title: 'Rest',
    tagline: 'A small HTTP client on top of undici, with routes and multipart files.',
    icon: 'send',
  },
  {
    slug: 'utils',
    dir: 'utils',
    npm: 'detritus-utils',
    repo: 'detritusjs/utils',
    title: 'Utils',
    tagline: 'Collections, event emitters, snowflakes and timers shared by everything.',
    icon: 'wrench',
  },
];
