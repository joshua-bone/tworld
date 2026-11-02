// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createPrivateReplayProfile } from "@player-web/impl/privateReplayProfile";
afterEach(()=>vi.restoreAllMocks());
it("keeps selection, progress and imports in memory and blocks replay persistence",async()=>{
  const storage=vi.spyOn(Storage.prototype,"setItem");
  const profile=createPrivateReplayProfile();
  await profile.saveSelection({seriesFile:"Synthetic-MS.dac",levelNumber:7});
  expect(await profile.loadSelection()).toEqual({seriesFile:"Synthetic-MS.dac",levelNumber:7});
  await profile.saveImportedDatFile({filename:"synthetic.dat",datBytes:new Uint8Array([1])});
  expect(await profile.listImportedDatFiles()).toHaveLength(1);
  expect(await createPrivateReplayProfile().listImportedDatFiles()).toEqual([]);
  expect(await createPrivateReplayProfile().loadSelection()).toBeNull();
  expect(await profile.loadPreferences()).toMatchObject({autoSaveWinningHighScoreReplays:false,autoDownloadReplaysOnSave:false});
  await expect(profile.saveReplayEntry({fileName:"private.tws",seriesFile:"Synthetic-MS.dac",levelNumber:7,levelName:"Synthetic",ruleset:"MS",source:"saved-run",result:null,finalScore:null,undoUsedCount:null,bytes:new Uint8Array([1])})).rejects.toThrow(/private replay/i);
  expect(await profile.loadReplayEntries()).toEqual([]);
  expect(storage).not.toHaveBeenCalled();
});
