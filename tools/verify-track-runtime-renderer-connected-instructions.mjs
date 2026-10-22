import {pathToFileURL} from 'node:url';
import {verifyTrackRuntimeLoading} from './verify-track-runtime-loading-instructions.mjs';
export function verifyTrackRuntimeRenderer(options={}) {return verifyTrackRuntimeLoading({fixtures:120,...options,withRenderer:true,output:options.output===undefined?'analysis/track-runtime-renderer-connected-instruction-check.json':options.output});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyTrackRuntimeRenderer()));
