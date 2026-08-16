// Generates ans104.json — golden fixtures for Ans104Test, produced by the
// reference implementation (arbundles) so the Java port is pinned cross-impl.
//
// Run (from any dir with arbundles + arweave installed):
//   npm i arbundles arweave
//   node generate.mjs /path/to/test/fixtures/arweave/ans104.json
//
// RSA-PSS is salted, so signatures are not reproducible run-to-run — the fixture
// pins the deterministic parts (deepHash digest, Avro tag bytes, id derivation)
// and includes one arbundles-signed item per case for cross-verification.
import { createData, ArweaveSigner } from 'arbundles';
import Arweave from 'arweave';
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';

const out = process.argv[2] || 'ans104.json';
const arweave = Arweave.init({});
const jwk = await arweave.wallets.generate();
const address = await arweave.wallets.jwkToAddress(jwk);
const signer = new ArweaveSigner(jwk);

const cases = [];
async function addCase(desc, data, tags) {
  const item = createData(data, signer, { tags });
  await item.sign(signer);
  const sigData = await item.getSignatureData();   // the deepHash digest RSA-PSS signs
  cases.push({
    desc,
    data_b64: Buffer.from(data).toString('base64'),
    tags,
    tagsAvro_b64: Buffer.from(item.rawTags).toString('base64'),
    deepHash_hex: Buffer.from(sigData).toString('hex'),
    nodeSignedItem_b64: Buffer.from(item.getRaw()).toString('base64'),
    nodeSignedId: item.id,
  });
  const idCheck = createHash('sha256').update(item.rawSignature).digest('base64url');
  if (idCheck !== item.id) throw new Error('id derivation mismatch in reference impl?!');
}

await addCase('jpeg plate with Content-Type tag',
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]),
  [{ name: 'Content-Type', value: 'image/jpeg' }]);
await addCase('zero tags', Buffer.from('no tags here'), []);
await addCase('multi-tag',
  Buffer.from('{"manifest":"arweave/paths"}'),
  [{ name: 'Content-Type', value: 'application/x.arweave-manifest+json' },
   { name: 'App-Name', value: 'Atelier' }]);
await addCase('empty data', Buffer.alloc(0), [{ name: 'Content-Type', value: 'text/plain' }]);
await addCase('unicode tag value', Buffer.from('unicode'), [{ name: 'Title', value: 'atelier — 🌸 édition' }]);

writeFileSync(out, JSON.stringify({ jwk, address, cases }, null, 1));
console.log('wrote', out, 'cases:', cases.length, 'address:', address);
