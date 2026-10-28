import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const bytes=readFileSync(new URL('../docs/zeus/z1-security-approval.json',import.meta.url));
assert.equal(hash(bytes),'d596e41680859fa1e2223a6ae8b95f7086d7da0fa35acb6ef174556be0ff9f77','Security approval metadata drift');
const approved=JSON.parse(bytes).files;
export const securityPins={
  "apps/api/package.json": "33426f2d525d7274f3ff4467287a2df8fb6a5d061765d78d714a0ed4214c283b",
  "apps/api/package-lock.json": "6937f66c240d982fa801c2d2eebf0652052926f30936d04d1fe538340b23a2d5",
  "apps/web/package.json": "a3d53a5b6c13efa109eca30ed9d4f97b22546be4702553dc7aab889789984de0",
  "apps/web/package-lock.json": "d675f687229056ca4a96af27781a05b0a1d4611d5d022ac284aba24660d85987"
};
export function matchesSecurityApproval(path,bytes){return Object.hasOwn(securityPins,path)&&hash(bytes.toString('utf8').replaceAll('\r\n','\n'))===securityPins[path];}
export function inverseSecurityInput(path,bytes){
 const source=bytes.toString('utf8').replaceAll('\r\n','\n');
 if(!matchesSecurityApproval(path,bytes))return source;
 const rule=approved[path],data=JSON.parse(source);
 if(rule.beforeSections){for(const [key,value]of Object.entries(rule.beforeSections)){if(value===null)delete data[key];else data[key]=structuredClone(value);}}
 else {for(const key of rule.addedEntries)delete data.packages[key];for(const [key,value]of Object.entries(rule.beforeEntries))data.packages[key]=structuredClone(value);data.packages=Object.fromEntries(Object.entries(data.packages).sort(([a],[b])=>rule.packageOrder==='ascii'?(a<b?-1:a>b?1:0):a.localeCompare(b,'en')));}
 const inverse=JSON.stringify(data,null,2)+'\n';assert.equal(hash(inverse),rule.beforeHash,'Unauthorized security dependency delta');return inverse;
}
export function verifySecurityApproval(read){for(const [path,pin]of Object.entries(securityPins)){const bytes=read(path);assert.equal(matchesSecurityApproval(path,bytes),true,'Security approval drift: '+path);assert.equal(hash(inverseSecurityInput(path,bytes)),approved[path].beforeHash);}}
