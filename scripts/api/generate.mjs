import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standalone from 'ajv/dist/standalone/index.js';
import { _ } from 'ajv';
const check = process.argv.includes('--check');
const temp = mkdtempSync(join(tmpdir(), 'gamo-api-'));
try {
  const bundle = join(temp, 'bundle.json');
  execFileSync('pnpm', ['exec', 'redocly', 'bundle', 'openapi/root.yaml', '-o', bundle], {
    stdio: 'inherit',
  });
  const spec = JSON.parse(await readFile(bundle, 'utf8'));
  const publicSpec = structuredClone(spec);
  for (const [path, item] of Object.entries(publicSpec.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (op?.['x-internal'] || op?.['x-status'] === 'local-demo-only' || op?.['x-status'] === 'demo-stub')
        delete item[method];
    }
    if (
      !Object.keys(item).some((k) =>
        ['get', 'post', 'delete', 'put', 'patch', 'head', 'options', 'trace'].includes(k),
      )
    )
      delete publicSpec.paths[path];
  }
  // Remove unused schemas and security schemes from public artifact via Redocly.
  await writeFile(join(temp, 'public-source.json'), JSON.stringify(publicSpec));
  execFileSync(
    'pnpm',
    [
      'exec',
      'redocly',
      'bundle',
      join(temp, 'public-source.json'),
      '--remove-unused-components',
      '-o',
      join(temp, 'public.json'),
    ],
    { stdio: 'inherit' },
  );
  const publicBundle = JSON.parse(await readFile(join(temp, 'public.json'), 'utf8'));
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    code: { source: true, esm: true, lines: true, formats: _`formats` },
  });
  addFormats(ajv);
  ajv.addSchema({ $id: 'gamo', components: spec.components });
  const exports = {};
  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    const key = `schema_${name}`;
    ajv.addSchema({ $id: key, ...schema });
    // component references are resolved to the one authoritative schema graph.
    const rewrite = (v) => {
      if (Array.isArray(v)) return v.map(rewrite);
      if (v && typeof v === 'object')
        return Object.fromEntries(
          Object.entries(v).map(([k, x]) => [
            k,
            k === '$ref' && x.startsWith('#/') ? `gamo${x}` : rewrite(x),
          ]),
        );
      return v;
    };
    ajv.removeSchema(key);
    ajv.addSchema({ $id: key, ...rewrite(schema) });
    exports[key] = key;
  }
  let validators = standalone(ajv, exports);
  const helpers = [...new Set([...validators.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]))];
  let imports = '';
  for (const [index, helper] of helpers.entries()) {
    if (!helper.startsWith('ajv/dist/runtime/'))
      throw new Error(`Unexpected standalone runtime dependency: ${helper}`);
    imports += `import helper${index} from "${helper}.js";\n`;
    validators = validators.replaceAll(`require("${helper}")`, `helper${index}`);
  }
  validators = imports + validators;
  validators =
    '// Generated from openapi/root.yaml. DO NOT EDIT.\nimport formatsModule from "ajv-formats/dist/formats.js";\nconst formats = formatsModule.fullFormats;\n' +
    validators;
  const types = '// Generated from openapi/root.yaml. DO NOT EDIT.\n' + astToString(await openapiTS(spec));
  const publicTypes =
    '// Generated public contract. DO NOT EDIT.\n' + astToString(await openapiTS(publicBundle));
  const artifacts = {
    'openapi/bundled/internal.json': JSON.stringify(spec, null, 2) + '\n',
    'openapi/bundled/public.json': JSON.stringify(publicBundle, null, 2) + '\n',
    'packages/api-contracts/src/internal.d.ts': types,
    'packages/api-contracts/src/public.d.ts': publicTypes,
    'packages/api-contracts/src/validators.js': validators,
  };
  for (const [file, data] of Object.entries(artifacts)) {
    if (check) {
      if ((await readFile(file, 'utf8').catch(() => '')) !== data)
        throw new Error(`Stale generated artifact: ${file}. Run make api-types.`);
    } else {
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, data);
    }
  }
  console.log(
    check
      ? 'Generated artifacts are current (verification wrote only temporary files).'
      : 'Generated bundles, TypeScript contracts and Worker validators.',
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
