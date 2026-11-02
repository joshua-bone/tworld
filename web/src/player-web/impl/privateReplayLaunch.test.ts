// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeSolutionFile } from "@content/api/solution-file";
import type { SeriesCatalogEntry } from "@content/api/series";
import { resolveUrlReplayLaunch } from "@player-web/impl/urlReplayLaunch";

const origin = "https://joshua-server-775718163601.us-west1.run.app";
const channel = "01234567-89ab-cdef-0123-456789abcdef";
const selection = { seriesFile: "CCLP5-MS.dac", levelNumber: 7 };
const resolution = { selection, message: null, overrideApplied: true };
const catalog = [{filebase: selection.seriesFile,ruleset:"MS",levels:[{number:7,name:"Synthetic",password:"ABCD"}]}] as SeriesCatalogEntry[];
const payload = {flags:0,randomSlideDirection:1,stepping:2,randomSeed:42,moves:[{when:0,dir:8}]};
function bytes(password="ABCD",ruleset:"MS"|"Lynx"="MS") {
  return serializeSolutionFile({ruleset,flags:0,extraHeader:new Uint8Array(),setName:null,entries:[{levelNumber:7,password,bestTimeTicks:4,solutionData:null,expandedSolution:payload}]}).buffer;
}
function prepare(expectedOrigin=origin) {
  window.history.replaceState(null,"",`/?set=CCLP5&level=7&ruleset=MS#privateReplay=${channel}&replayOrigin=${encodeURIComponent(expectedOrigin)}`);
  const opener={postMessage:vi.fn(),closed:false};
  vi.stubGlobal("opener",opener);
  return opener;
}
function send(source: unknown, data: unknown, eventOrigin=origin) {
  window.dispatchEvent(new MessageEvent("message",{origin:eventOrigin,source:source as Window,data}));
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();window.history.replaceState(null,"","/");});

describe("private replay window handshake",()=>{
  it("accepts only the expected opener, origin and channel then validates catalog data without fetching",async()=>{
    const opener=prepare();const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    const pending=resolveUrlReplayLaunch(resolution,catalog);
    expect(opener.postMessage).toHaveBeenCalledWith({type:"tworld-private-replay-ready",channel},origin);
    const data={type:"tworld-private-replay",channel,bytes:bytes()};
    send({},data);send(opener,data,"https://evil.test");send(opener,{...data,channel:"wrong"});
    expect(opener.postMessage).toHaveBeenCalledTimes(1);
    send(opener,data);
    const result=await pending;
    expect(result.replay).toMatchObject({...selection,private:true,launch:{kind:"legacy",replay:payload}});
    expect(opener.postMessage).toHaveBeenLastCalledWith({type:"tworld-private-replay-result",channel,ok:true},origin);
    expect(window.location.hash).toBe("");expect(fetch).not.toHaveBeenCalled();
    send(opener,data);expect(opener.postMessage).toHaveBeenCalledTimes(2);
  });
  it.each([["wrong password",()=>bytes("WXYZ")],["wrong ruleset",()=>bytes("ABCD","Lynx")],["invalid bytes",()=>new ArrayBuffer(1)]] as const)("rejects %s",async(_label,input)=>{
    const opener=prepare();const pending=resolveUrlReplayLaunch(resolution,catalog);send(opener,{type:"tworld-private-replay",channel,bytes:input()});
    expect((await pending).replay).toBeNull();expect(opener.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ok:false}),origin);
  });
  it.each(["https://evil.test","https://localhost.evil.test:3000","https://joshua-server-775718163601.us-west1.run.app.evil.test"])("refuses an untrusted origin %s",async bad=>{
    const opener=prepare(bad);expect((await resolveUrlReplayLaunch(resolution,catalog)).replay).toBeNull();expect(opener.postMessage).not.toHaveBeenCalled();
  });
  it.each(["http://localhost:3000", "http://127.0.0.1:3107"])("accepts an exact permitted development origin %s", async devOrigin => {
    const opener = prepare(devOrigin);
    const pending = resolveUrlReplayLaunch(resolution, catalog);
    send(opener, {type:"tworld-private-replay", channel, bytes:bytes()}, devOrigin);
    expect((await pending).replay).not.toBeNull();
  });
  it("requires an opener and rejects oversized payloads", async () => {
    prepare();vi.stubGlobal("opener", null);
    expect((await resolveUrlReplayLaunch(resolution, catalog)).message).toMatch(/opener/);
    const opener = prepare();const pending = resolveUrlReplayLaunch(resolution, catalog);
    send(opener, {type:"tworld-private-replay", channel, bytes:new ArrayBuffer(4 * 1024 * 1024 + 1)});
    expect((await pending).replay).toBeNull();
  });
  it("times out and removes the listener without accepting a late replay",async()=>{
    vi.useFakeTimers();const opener=prepare();const pending=resolveUrlReplayLaunch(resolution,catalog);
    await vi.advanceTimersByTimeAsync(30_000);expect((await pending).message).toMatch(/timed out/i);
    const calls=opener.postMessage.mock.calls.length;send(opener,{type:"tworld-private-replay",channel,bytes:bytes()});expect(opener.postMessage).toHaveBeenCalledTimes(calls);
  });
});
