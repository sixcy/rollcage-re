import {buildEditedArchive} from '../../src/archive-write.mjs';
import {createBlobZIP} from './zip.mjs';

export async function buildPickupGameDownload(archive, replacements, project, options = {}) {
  const scenery=project.schemaVersion===2;
  if (!(archive.image instanceof Blob)) throw Error('Game export requires the original locally selected IMG file.');
  const plan = buildEditedArchive(archive.indexData, archive.image.size, replacements);
  const image = new Blob(plan.parts.map(part => part instanceof Uint8Array ? part : archive.image.slice(part.offset, part.offset + part.length)));
  if (image.size !== plan.imageBytes) throw Error('Archive assembly length differs from the validated plan.');
  const readme = scenery ? [
    'Rollcage track editor — experimental local game export', '',
    '1. Keep your original installation and IMG/IDX files unchanged.',
    '2. Make a separate copy of your Rollcage Redux installation.',
    '3. Replace BOTH IDXData/Rollcage.img and IDXData/Rollcage.idx in that copy.',
    '4. Enable weapons/pickups when testing pickup changes. Edits apply to LOW and HIGH.', '',
    'To continue editing, reopen the same starting archives used for this project and load track-project.json.',
    'Keep those starting files with the project. The IMG/IDX in this ZIP contain the exported edits and form a new starting point.',
    'This export contains pickup and supported plain scenery edits together.',
    'Scenery collision uses preserved native shapes and rebuilt conservative spatial candidate lists.',
    'Scenery exports have parser/browser validation; original-process game compatibility is not yet established.',
    'Special/destructible/animated objects, Blender import and LEV16/17 editing are unsupported.', '',
    `Edited archive entries: ${plan.changes.map(change => typeof change === 'number' ? change : change.resourceIndex).join(', ')}`
  ].join('\n') : [
    'Rollcage pickup editor — local game export', '',
    '1. Keep your original installation and original IMG/IDX files unchanged.',
    '2. Make a separate copy of your Rollcage Redux installation.',
    '3. In that copy, replace BOTH IDXData/Rollcage.img and IDXData/Rollcage.idx with the files from this ZIP.',
    '4. Enable weapons/pickups in the game. Edits apply to LOW and HIGH versions of each edited level.', '',
    'To continue editing: open your ORIGINAL archives in the track viewer, then load pickup-project.json.',
    'This project changes pickup spawn points only. It preserves the original random weapon awards and respawn definitions.',
    'LEV15, LEV16 and LEV17 are excluded. Maximum 16 pickup points per level.',
    'Tested in Rollcage Redux 1.3.8.0 on LEV1, LOW and HIGH, with unchanged, zero and 16 pickups.', '',
    `Edited archive entries: ${plan.changes.map(change => typeof change === 'number' ? change : change.resourceIndex).join(', ')}`
  ].join('\n');
  const blob = await createBlobZIP([
    {name: 'Rollcage.img', data: image}, {name: 'Rollcage.idx', data: plan.index},
    {name: scenery?'track-project.json':'pickup-project.json', data: JSON.stringify(project, null, 2)}, {name: 'README.txt', data: readme}
  ], options);
  return {filename: scenery?'rollcage-track-edits.zip':'rollcage-pickup-edits.zip', blob, imageBytes: image.size, changes: plan.changes};
}
