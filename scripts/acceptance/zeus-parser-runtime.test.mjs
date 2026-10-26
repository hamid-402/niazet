import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";

const manifest = new URL("../../apps/api/package.json", import.meta.url);
const requireApi = createRequire(manifest);
const version = (loader, name) => {
  let folder = dirname(loader.resolve(name));
  while (!existsSync(join(folder, "package.json"))) {
    const parent = dirname(folder);
    assert.notEqual(parent, folder);
    folder = parent;
  }
  const metadata = JSON.parse(
    readFileSync(join(folder, "package.json"), "utf8"),
  );
  assert.equal(metadata.name, name);
  return metadata.version;
};
test("installed parser resolves exactly the approved nested versions; shared copies unchanged", () => {
  const parserRequire = createRequire(requireApi.resolve("body-parser"));
  assert.equal(parserRequire("./package.json").version, "2.4.0");
  assert.equal(version(parserRequire, "content-type"), "2.1.0");
  assert.equal(parserRequire("qs/package.json").version, "6.16.1");
  assert.equal(requireApi("qs/package.json").version, "6.16.0");
  assert.equal(
    version(createRequire(requireApi.resolve("type-is")), "content-type"),
    "2.0.0",
  );
});

test("compressed-body regression stays alive in disposable child; ordinary JSON/form/upload preserved", () => {
  // No application boot, database, credentials or main-server requests. Any
  // uncaught parser exception terminates only this child and fails the test.
  const source = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import http from 'node:http';
    import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
    const require = createRequire(${JSON.stringify(manifest.href)});
    const express = require('express'), multer = require('multer');
    const app = express();
    app.use(express.json({limit:'8kb'}));
    app.use(express.urlencoded({extended:true,limit:'8kb'}));
    app.post('/echo', (req,res)=>res.json({body:req.body}));
    app.post('/upload',multer({limits:{fileSize:128,files:1},fileFilter:(_r,f,cb)=>cb(null,f.mimetype==='text/plain')}).single('file'),(req,res)=>res.json({size:req.file?.size??0}));
    app.use((error,_req,res,_next)=>res.status(error.code==='LIMIT_FILE_SIZE'?413:(error.status??400)).json({type:error.type??error.code??'parser-error'}));
    const server = await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const cases=[];
    async function post(name,body,headers,status=200){
      const response=await new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:server.address().port,path:name.startsWith('multipart')?'/upload':'/echo',method:'POST',headers:{'content-length':body.length,...headers}},res=>{const data=[];res.on('data',c=>data.push(c));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(data).toString())}));});r.on('error',reject);r.end(body);});
      assert.equal(response.status,status,name);cases.push(name);return response.body;
    }
    try {
      const data=Buffer.from(JSON.stringify({message:'نیازت',ok:true}));
      assert.equal((await post('plain-json',data,{'content-type':'application/json'})).body.message,'نیازت');
      for(const [encoding,zip] of [['gzip',gzipSync],['deflate',deflateSync],['br',brotliCompressSync]]){
        assert.equal((await post(encoding,zip(data),{'content-type':'application/json','content-encoding':encoding})).body.ok,true);
      }
      await post('malformed-json',Buffer.from('{'),{'content-type':'application/json'},400);
      await post('invalid-compression',Buffer.from('not-a-gzip'),{'content-type':'application/json','content-encoding':'gzip'},400);
      await post('unsupported-encoding',data,{'content-type':'application/json','content-encoding':'unknown'},415);
      await post('oversize-json',Buffer.from(JSON.stringify({text:'x'.repeat(9000)})),{'content-type':'application/json'},413);
      const form=await post('urlencoded',Buffer.from('name=niazat&nested%5Bvalue%5D=hello&__proto__%5Bpolluted%5D=yes'),{'content-type':'application/x-www-form-urlencoded'});
      assert.equal(form.body.nested.value,'hello');assert.equal({}.polluted,undefined);
      const trailing=Buffer.concat([gzipSync(data),Buffer.from('bad-trailing-data')]);
      // Hardened parser rejects malformed compressed suffix; an ordinary valid
      // response without a late process crash would also be a safe outcome.
      const result=await new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:server.address().port,path:'/echo',method:'POST',headers:{'content-type':'application/json','content-encoding':'gzip','content-length':trailing.length}},res=>{const data=[];res.on('data',c=>data.push(c));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(data).toString())}));});r.on('error',reject);r.end(trailing);});
      assert.ok([200,400].includes(result.status));if(result.status===200)assert.equal(result.body.body.ok,true);
      cases.push('compressed-trailing-regression');
      await new Promise(resolve=>setTimeout(resolve,100));
      assert.equal((await post('alive-after-trailing',data,{'content-type':'application/json'})).body.ok,true);
      for(const size of [4,200]){
        const body=Buffer.from('--bound\\r\\nContent-Disposition: form-data; name="file"; filename="test.txt"\\r\\nContent-Type: text/plain\\r\\n\\r\\n'+'a'.repeat(size)+'\\r\\n--bound--\\r\\n');
        const result=await post('multipart-'+size,body,{'content-type':'multipart/form-data; boundary=bound'},size===4?200:413);
        if(size===4)assert.equal(result.size,4);
      }
      console.log(JSON.stringify({passed:cases.length,cases,trailingStatus:result.status,isolated:true,database:false}));
    } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  `;
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", source],
    { encoding: "utf8", windowsHide: true, timeout: 15000 },
  );
  const report = JSON.parse(output);
  assert.equal(report.passed, 13);
  assert.equal(report.isolated, true);
  assert.equal(report.database, false);
});
