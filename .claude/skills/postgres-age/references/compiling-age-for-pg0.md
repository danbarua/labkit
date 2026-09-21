---
name: install-age-into-pg0
context: "Notes from compiling Apache AGE for pg0 Postgres 18 on Intel Mac when pg_config bakes a missing Xcode sysroot — wrap gcc, make install, CREATE EXTENSION."
---

# Install Apache AGE into pg0 Postgres 18 (Intel Mac)

Use when a local pg0 instance needs `CREATE EXTENSION age` and `age.control` is missing from `~/.pg0/installation/<ver>/share/extension`. Do **not** download Xcode or a compiler toolchain.

## Why pg_config breaks the build

pg0's `pg_config --cppflags` / `--ldflags` bake:

```
-isysroot /Applications/Xcode_15.2.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX14.2.sdk
```

That path is often absent. CommandLineTools SDK is enough:

```shell
xcrun --show-sdk-path
```

Clang uses the **last** `-isysroot`. A wrapper that **strips** every `-isysroot` then injects the CommandLineTools SDK is safer than appending.

Need: `/usr/bin/{gcc,flex,bison,make,perl}` already on the machine.

## Wrapper

`~/.pg0/pg0-cc` (or keep a copy next to the instance):

```sh
#!/bin/sh
SDK="$(xcrun --show-sdk-path)"
args=""
skip=0
for a in "$@"; do
  if [ "$skip" = "1" ]; then skip=0; continue; fi
  if [ "$a" = "-isysroot" ]; then skip=1; continue; fi
  args="$args $a"
done
exec /usr/bin/gcc -isysroot "$SDK" $args%
```

`chmod +x` it.

## Source and build

PG18 tag that matched pg0 18.1.0 (2026-09-13):

`https://github.com/apache/age/archive/refs/tags/PG18/v1.7.0-rc0.tar.gz`

~5 MB. Not the docker AGE image.

```sh
#!/bin/sh
PG_CONFIG="$HOME/.pg0/installation/18.1.0/bin/pg_config"
tar -xzf age.tar.gz
cd apache-age-1.7.0
make PG_CONFIG="$PG_CONFIG" CC=~/.pg0/pg0-cc
make PG_CONFIG="$PG_CONFIG" CC=~/.pg0/pg0-cc install
```

Installs:

- `~/.pg0/installation/18.1.0/lib/age.dylib`
- `~/.pg0/installation/18.1.0/share/extension/age.control`
- `~/.pg0/installation/18.1.0/share/extension/age--1.7.0.sql`

Warnings (`%ld` vs `graphid`) are AGE's; they do not fail the build.

## Instance

```sh
# pg0 will allocate next available port if 5432 taken
# --data-dir will not work with a PGLite data-dir. 32-bit WASM compiled vs 64-bit native. Not happening.
pg0 start --name labkit --database labkit # creates ~/.pg0/instances/labkit/.. instance.json + data/
# data dir needs chmod 0700 or postgres won't start
pg0 psql --name labkit -c "CREATE EXTENSION IF NOT EXISTS age;" -c "LOAD 'age';"
```

`shared_preload_libraries=age` is not required for `CREATE EXTENSION` / `LOAD` on 1.7.0 here.

URI: `postgresql://postgres:posgres@127.0.0.1:5433/labkit` # 

Do not point `test:pg` at this instance unless you intend to.

## Fallback

If the compile still needs a missing header or a download, stop. 
Server-side PGlite with one held connection is the product fallback; do not fetch Xcode.
