# Changelog

## [v0.8.3] - 2026-08-05

* Use `action_inputs` for `browser_eval`

## [v0.8.2] - 2026-07-30

* Add Tidewave Connect

## [v0.8.1] - 2026-07-25

* Add `install` command

## [v0.8.0] - 2026-07-22

* Add the Tidewave Toolbar
* Align minor version across Tidewave packages
* Drop Next.JS support

## [0.7.0] - 2026-06-14

* Support namespaces/files in `get_docs` tool and make it return a list of exports
* Support re-exports in `get_docs` lookups
* Improve out-of-the-box experience for remote access (which remains opt-in)

## [0.6.0] - 2025-12-31

* Tanstack support
* Write logs and instrumentation to a file so it works across multiple runtimes

## [0.5.5] - 2025-11-25

* Fix missing items element on `project_eval`
* Allow install to continue even if dependencies cannot be installed

## [0.5.4] - 2025-11-13

* Fix async messages on `project_eval`

## [0.5.3] - 2025-11-12

* Make sure `instrumentation.ts` is compatible with webpack
* Handle undefined hosts in Vite

## [0.5.2] - 2025-11-12

* Make sure chalk and commander are added as dependencies
* Serve /tidewave and /tidewave/config routes from Vite

## [0.5.1] - 2025-11-11

* Add `npx tidewave install` and trim down dependency list.

## [0.5.0] - 2025-11-10

* Initial release.