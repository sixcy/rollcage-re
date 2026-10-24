import {readFile,readdir} from 'node:fs/promises';
import {buildViewerBundle} from './track-viewer-bundle.mjs';

const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const markdown=text=>text.split(/\r?\n/).map(line=>{
  if(line.startsWith('# '))return `<h2>${escape(line.slice(2))}</h2>`;
  if(line.startsWith('## '))return `<h3>${escape(line.slice(3))}</h3>`;
  if(line.startsWith('- '))return `<p class="change">• ${escape(line.slice(2))}</p>`;
  return line?`<p>${escape(line)}</p>`:'';
}).join('\n');
export async function buildChangelog() {
  const names=(await readdir(new URL('../../docs/changelog/',import.meta.url))).filter(n=>/^\d{4}-\d\d-\d\d-\d\d-.+\.md$/.test(n)).sort().reverse();
  const entries=await Promise.all(names.map(async name=>({name,body:await readFile(new URL(`../../docs/changelog/${name}`,import.meta.url),'utf8')})));
  const latest=entries.slice(0,3).map(entry=>`<article>${markdown(entry.body)}</article>`).join('\n');
  const history=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Track Viewer changelog</title><style>body{background:#0c121d;color:#e6edf7;font:15px/1.6 system-ui;max-width:900px;margin:32px auto;padding:20px}a{color:#91dce4}article{border-top:1px solid #344457;padding:16px 0}.change{margin:5px 0}h2{font-size:21px}h3{font-size:16px}</style><a href="../track-viewer.html">← Track Viewer</a><h1>Track Viewer changelog</h1>${entries.map(entry=>`<article id="${entry.name.slice(0,-3)}">${markdown(entry.body)}</article>`).join('\n')}</html>\n`;
  return {latest,history};
}
export async function buildTrackViewerPage() {
  const [template,bundle,changelog]=await Promise.all([readFile(new URL('../track-viewer/viewer.html',import.meta.url),'utf8'),buildViewerBundle(),buildChangelog()]);
  return template.replace('__CHANGELOG__',()=>changelog.latest).replace('__VIEWER_BUNDLE__',()=>bundle.replace(/<\/script/gi,'<\\/script'));
}
