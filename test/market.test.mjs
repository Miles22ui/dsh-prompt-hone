/**
 * Repository-level guards.
 *
 * The market index is what other people install from, and nothing in the plugin
 * fails when it drifts from the package it advertises: a stale `commit` or an
 * unbumped `version` installs the wrong code silently. These checks run in CI so
 * that drift fails loudly instead.
 */
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const readJson = relative => JSON.parse(readFileSync(new URL(relative, root), 'utf8'))
const readText = relative => readFileSync(new URL(relative, root), 'utf8')

let failures = 0
function check(name, ok, detail) {
  if (ok) { console.log(`ok   ${name}`); return }
  failures++
  console.log(`FAIL ${name}${detail === undefined ? '' : '\n     ' + detail}`)
}

const pkg = readJson('plugin/package.json')
const market = readJson('market/index.json')

// Document shape
check('index declares format 1', market.format === 1, String(market.format))
check('index title carries the required English fallback',
  typeof market.title === 'object' && typeof market.title.en === 'string' && market.title.en !== '')
check('index lists exactly this repository\'s plugin',
  Array.isArray(market.plugins) && market.plugins.length === 1, `count=${market.plugins?.length}`)

const plugin = market.plugins?.[0] ?? {}
const versions = plugin.versions ?? []
check('the plugin advertises at least one version', versions.length > 0)

const top = versions[0] ?? {}
const source = top.source ?? {}

// The index must describe the package in this repository, at this version
check('index version matches plugin/package.json',
  top.version === pkg.version, `index=${top.version} package=${pkg.version}`)
check('index name matches the package name',
  plugin.name === pkg.name, `index=${plugin.name} package=${pkg.name}`)
check('a release timestamp is a Unix second value',
  Number.isInteger(top.publishTimestamp) && top.publishTimestamp > 1_600_000_000 && top.publishTimestamp < 4_000_000_000,
  String(top.publishTimestamp))

// The install source must be a pinned commit, never a branch
check('source is a git install', source.type === 'git', String(source.type))
check('source pins a 40-hex commit', /^[0-9a-f]{40}$/.test(source.commit ?? ''), String(source.commit))
check('source url is canonical https without .git',
  typeof source.url === 'string' && /^https:\/\/[^?#]+$/.test(source.url) && !source.url.endsWith('.git'),
  String(source.url))
check('source path is the plugin directory in this repository',
  source.path === 'plugin', String(source.path))
check('that directory really holds the bundle', existsSync(new URL('plugin/index.js', root)))

// An install range without an upper bound would happily accept a future DSH that
// changed the internal entry points this plugin's client half relies on.
check('engines.dsh declares an upper bound',
  typeof top.engines?.dsh === 'string' && /<\d/.test(top.engines.dsh), String(top.engines?.dsh))
check('the package manifest declares the same range',
  pkg.engines?.dsh === top.engines?.dsh, `${pkg.engines?.dsh} vs ${top.engines?.dsh}`)

// Declarations the reader relies on
const category = plugin.metadata?.category
check('the category is declared by the index',
  category !== undefined && Object.hasOwn(market.metadata?.categories ?? {}, category), String(category))
check('the repository points at the plugin subdirectory',
  plugin.repository?.directory === 'plugin' && plugin.repository?.url === source.url,
  JSON.stringify(plugin.repository))

// Readers need the index address
check('both READMEs document an index URL',
  ['README.md', 'README.zh.md'].every(file => readText(file).includes('market/index.json')))
check('the changelog mentions the version it publishes',
  readText('CHANGELOG.md').includes(`## ${top.version}`))

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
