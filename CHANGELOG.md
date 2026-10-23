# Changelog

## [1.9.4](https://github.com/mindistio/numo-cli/compare/v1.9.3...v1.9.4) (2026-10-23)


### Bug Fixes

* **cli:** reject excess positional arguments (commander 15) ([b71091a](https://github.com/mindistio/numo-cli/commit/b71091a6f996059897ef05ee0bacdaf25ea3a592))

## [1.9.3](https://github.com/mindistio/numo-cli/compare/v1.9.2...v1.9.3) (2026-10-13)


### Bug Fixes

* **tasks:** let the API decide completion dates; validate numeric options; accurate delete/uncomplete notices ([#26](https://github.com/mindistio/numo-cli/issues/26)) ([22fc6f7](https://github.com/mindistio/numo-cli/commit/22fc6f7bbc3d56f454917898e599c737fbd1d315))

## [1.9.2](https://github.com/mindistio/numo-cli/compare/v1.9.1...v1.9.2) (2026-10-13)


### Bug Fixes

* bump the plugin manifests with every release ([db47c19](https://github.com/mindistio/numo-cli/commit/db47c19ee414ca74bf8be8ba89ea22d2c518aa35))
* bump the plugin manifests with every release ([a417230](https://github.com/mindistio/numo-cli/commit/a41723068733e0723ee305ea3d039598d5519302))

## [1.9.1](https://github.com/mindistio/numo-cli/compare/v1.9.0...v1.9.1) (2026-10-13)


### Bug Fixes

* leave the time zone out when the system has no usable one ([17f5572](https://github.com/mindistio/numo-cli/commit/17f557225aea817af921b24adea0f8f6d14dad14))
* send the user's time zone with every request ([670833c](https://github.com/mindistio/numo-cli/commit/670833c7336c378c7041269b39b7e267973599ff))
* send the user's time zone with every request ([2bcc2d1](https://github.com/mindistio/numo-cli/commit/2bcc2d17d4e992c8bd3d88238a0af0e678472bbc))

## [1.9.0](https://github.com/mindistio/numo-cli/compare/v1.8.0...v1.9.0) (2026-09-10)


### Features

* package numo-cli as an Agent Plugins v1 plugin ([81768a6](https://github.com/mindistio/numo-cli/commit/81768a6c9d9462695e0789f17517fa35d7dd1b62))
* package numo-cli as an Agent Plugins v1 plugin ([2f3606b](https://github.com/mindistio/numo-cli/commit/2f3606bdf5c9d11e65c877fa8b9d9824f97df6ed))

## [1.8.0](https://github.com/mindistio/numo-cli/compare/v1.7.0...v1.8.0) (2026-08-18)


### Features

* numo register, numo verify-email, and honest phone signup/login reporting ([#17](https://github.com/mindistio/numo-cli/issues/17)) ([e56ba07](https://github.com/mindistio/numo-cli/commit/e56ba076602b938db18d621ab37bd7458703b24f))

## [1.7.0](https://github.com/mindistio/numo-cli/compare/v1.6.1...v1.7.0) (2026-07-31)


### Features

* slim CLI to a pure HTTP client ([#15](https://github.com/mindistio/numo-cli/issues/15)) ([8b08ad5](https://github.com/mindistio/numo-cli/commit/8b08ad54200fb62671bcaf37f97621f6ce4cd257))

## [1.6.1](https://github.com/mindistio/numo-cli/compare/v1.6.0...v1.6.1) (2026-07-29)


### Bug Fixes

* **auth:** complete phone (SMS) login flow ([#13](https://github.com/mindistio/numo-cli/issues/13)) ([500a6a3](https://github.com/mindistio/numo-cli/commit/500a6a3e6904f7cd9e77066ef2472569db343431))

## [1.6.0](https://github.com/mindistio/numo-cli/compare/v1.5.0...v1.6.0) (2026-06-20)


### Features

* make numo CLI discoverable and stable for AI agents (W-121) ([817b55e](https://github.com/mindistio/numo-cli/commit/817b55ee3310c456a6c405a0ad0476e19a9ebde2))
* make numo CLI discoverable and stable for AI agents (W-121) ([c93d48d](https://github.com/mindistio/numo-cli/commit/c93d48d1f0b3c199791bcd51e40926b440f89624))

## [1.5.0](https://github.com/mindistio/numo-cli/compare/v1.4.0...v1.5.0) (2026-04-09)


### Features

* add npm package links and download badge to docs ([61c5bf7](https://github.com/mindistio/numo-cli/commit/61c5bf731ed8dcb4ccedcbfef0cc87b9653a666f))
* add task visibility prompt and align document structure with mobile app ([02f114c](https://github.com/mindistio/numo-cli/commit/02f114ca20468cadbed65876f610780c620616ee))
* bake API base URL into bundle, default to api.numo.ai ([932bc98](https://github.com/mindistio/numo-cli/commit/932bc98adc383bca291f7ba6ca8632205b85c488))
* initial release of numo-cli ([762814b](https://github.com/mindistio/numo-cli/commit/762814bfa6cbe554adcff11e9f14059c274fc84e))
* migrate auth to the API server ([4f607de](https://github.com/mindistio/numo-cli/commit/4f607de081ccc4a555907f513fe4a505545b514c))
* migrate auth to API server, bake API URL ([86acc3a](https://github.com/mindistio/numo-cli/commit/86acc3a2c3af57fd2c4bd84feee72045642e7267))
* migrate auth to the API server; CLI is now a pure HTTP client ([e51fad0](https://github.com/mindistio/numo-cli/commit/e51fad04a6df73d939f59efe9206c3922ad819d5))


### Bug Fixes

* add activity tracking for replies and pre-publish improvements ([abc1fe3](https://github.com/mindistio/numo-cli/commit/abc1fe3c3a9229b2b7d1a765989e3f4d0f76dbc3))
* use resource names instead of full URLs in commit requests ([46748b8](https://github.com/mindistio/numo-cli/commit/46748b89a70bd9e74ed1949d6b21398175d7b395))

## [1.4.0](https://github.com/mindistio/numo-cli/compare/v1.3.0...v1.4.0) (2026-04-09)


### Features

* bake API base URL into bundle, default to api.numo.ai ([932bc98](https://github.com/mindistio/numo-cli/commit/932bc98adc383bca291f7ba6ca8632205b85c488))
* migrate auth to API server, bake API URL ([86acc3a](https://github.com/mindistio/numo-cli/commit/86acc3a2c3af57fd2c4bd84feee72045642e7267))

## [1.3.0](https://github.com/mindistio/numo-cli/compare/v1.2.0...v1.3.0) (2026-04-09)


### Features

* migrate auth to the API server ([4f607de](https://github.com/mindistio/numo-cli/commit/4f607de081ccc4a555907f513fe4a505545b514c))
* migrate auth to the API server; CLI is now a pure HTTP client ([e51fad0](https://github.com/mindistio/numo-cli/commit/e51fad04a6df73d939f59efe9206c3922ad819d5))

## [1.2.0](https://github.com/mindistio/numo-cli/compare/v1.1.0...v1.2.0) (2026-04-08)


### Features

* add task visibility prompt and align document structure with mobile app ([02f114c](https://github.com/mindistio/numo-cli/commit/02f114ca20468cadbed65876f610780c620616ee))

## [1.1.0](https://github.com/mindistio/numo-cli/compare/v1.0.1...v1.1.0) (2026-04-08)


### Features

* add npm package links and download badge to docs ([61c5bf7](https://github.com/mindistio/numo-cli/commit/61c5bf731ed8dcb4ccedcbfef0cc87b9653a666f))


### Bug Fixes

* use resource names instead of full URLs in commit requests ([46748b8](https://github.com/mindistio/numo-cli/commit/46748b89a70bd9e74ed1949d6b21398175d7b395))

## [1.0.1](https://github.com/mindistio/numo-cli/compare/v1.0.0...v1.0.1) (2026-04-08)


### Bug Fixes

* add activity tracking for replies and pre-publish improvements ([abc1fe3](https://github.com/mindistio/numo-cli/commit/abc1fe3c3a9229b2b7d1a765989e3f4d0f76dbc3))

## 1.0.0 (2026-03-30)


### Features

* initial release of numo-cli ([762814b](https://github.com/mindistio/numo-cli/commit/762814bfa6cbe554adcff11e9f14059c274fc84e))
