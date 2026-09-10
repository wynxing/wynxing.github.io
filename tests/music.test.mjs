import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts
  .transpile(
    readFileSync(
      new URL("../src/scripts/music-player.ts", import.meta.url),
      "utf8",
    ).replace(/import type .*?;\s*/, ""),
    { target: ts.ScriptTarget.ES2022 },
  )
  .replace(/export {};?/, "");
const track = (id) => ({
  id,
  title: `Track ${id}`,
  artist: "Test",
  src: `/test-${id}.wav`,
});
function harness(tracks = []) {
  const nodes = new Map();
  const docEvents = {};
  let home = true;
  const node = (name) => {
    if (nodes.has(name)) return nodes.get(name);
    const listeners = {},
      classes = new Set(),
      attrs = {};
    const value = {
      dataset: {},
      hidden: false,
      disabled: false,
      value: "",
      textContent: "",
      attrs,
      setAttribute(key, val) {
        attrs[key] = val;
      },
      removeAttribute(key) {
        delete attrs[key];
      },
      addEventListener(event, fn) {
        (listeners[event] ||= []).push(fn);
      },
      emit(event) {
        for (const fn of listeners[event] || []) fn();
      },
      classList: {
        toggle(key, force) {
          const state = force ?? !classes.has(key);
          if (state) classes.add(key);
          else classes.delete(key);
          return state;
        },
        contains: (key) => classes.has(key),
      },
      append(child) {
        child.parentElement = value;
      },
    };
    nodes.set(name, value);
    return value;
  };
  const player = node("player");
  player.dataset.playlist = JSON.stringify(tracks);
  player.querySelector = (selector) => node(selector.slice(6, -1));
  const audio = node("audio");
  let plays = 0,
    loads = 0;
  Object.assign(audio, {
    paused: true,
    currentTime: 0,
    duration: NaN,
    error: null,
    volume: 1,
    pause() {
      this.paused = true;
      this.emit("pause");
    },
    async play() {
      plays++;
      if (this.reject) throw new Error("offline");
      this.paused = false;
      this.emit("play");
    },
    load() {
      loads++;
      this.error = null;
    },
  });
  const document = {
    querySelector: () => player,
    getElementById: (id) =>
      id === "home-music-slot" ? (home ? node("slot") : null) : node("mini"),
    addEventListener: (name, fn) => {
      docEvents[name] = fn;
    },
  };
  runInNewContext(source, { document, DOMException });
  return {
    node,
    audio,
    player,
    get plays() {
      return plays;
    },
    get loads() {
      return loads;
    },
    navigate(isHome) {
      home = isHome;
      docEvents["astro:page-load"]();
    },
    async click(name) {
      node(name).emit("click");
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}
test("empty playlist is honest and cannot start playback", async () => {
  const h = harness();
  for (const key of ["play", "prev", "next", "seek", "volume"])
    assert.equal(h.node(key).disabled, true);
  await h.click("play");
  assert.equal(h.plays, 0);
});
test("single track never autoplays; navigation retains audio identity, progress and volume", async () => {
  const h = harness([track("one")]);
  assert.equal(h.plays, 0);
  assert.equal(h.node("next").disabled, true);
  await h.click("play");
  assert.equal(h.audio.paused, false);
  h.audio.duration = 120;
  h.audio.currentTime = 32;
  h.audio.emit("loadedmetadata");
  h.node("volume").value = "0.3";
  h.node("volume").emit("input");
  const audio = h.audio;
  for (const home of [false, true, false, true]) {
    h.navigate(home);
    assert.equal(h.audio, audio);
    assert.equal(h.audio.currentTime, 32);
    assert.equal(h.audio.volume, 0.3);
    assert.equal(h.audio.paused, false);
  }
  assert.equal(h.plays, 1);
  assert.equal(h.node("elapsed").textContent, "0:32");
  h.node("seek").value = "76";
  h.node("seek").emit("input");
  assert.equal(h.audio.currentTime, 76);
  await h.click("play");
  assert.equal(h.audio.paused, true);
});
test("playlist wraps and preserves paused/playing intent; errors can be retried", async () => {
  const h = harness([track("one"), track("two")]);
  await h.click("next");
  assert.equal(h.node("track-title").textContent, "Track two");
  assert.equal(h.plays, 0);
  await h.click("play");
  await h.click("next");
  assert.equal(h.node("track-title").textContent, "Track one");
  assert.equal(h.audio.paused, false);
  h.audio.pause();
  h.audio.reject = true;
  await h.click("play");
  assert.equal(h.node("music-error").hidden, false);
  assert.equal(h.node("play").attrs["aria-label"], "重试播放");
  h.audio.error = {};
  h.audio.reject = false;
  await h.click("play");
  assert.equal(h.loads, 1);
  assert.equal(h.node("music-error").hidden, true);
  assert.equal(h.audio.paused, false);
});
test("a superseded play rejection does not poison the newly selected track", async () => {
  const h = harness([track("one"), track("two")]);
  let reject;
  h.audio.play = () =>
    new Promise((_, no) => {
      reject = no;
    });
  h.node("play").emit("click");
  h.audio.play = async () => {
    h.audio.paused = false;
  };
  await h.click("next");
  reject(new Error("old request failed"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.node("track-title").textContent, "Track two");
  assert.equal(h.node("music-error").hidden, true);
});
test("page lifecycle aborts old listeners and disposes resources once", () => {
  const handlers = {},
    scopes = [];
  let disposed = 0;
  const lifecycle = ts.transpile(
    readFileSync(
      new URL("../src/scripts/lifecycle.ts", import.meta.url),
      "utf8",
    ).replace("export function", "function"),
    { target: ts.ScriptTarget.ES2022 },
  );
  runInNewContext(
    lifecycle +
      "\nonPage((signal, cleanup) => { scopes.push(signal); cleanup(() => disposed++); });",
    {
      document: {
        addEventListener: (event, fn) => {
          handlers[event] = fn;
        },
      },
      AbortController,
      scopes,
      get disposed() {
        return disposed;
      },
      set disposed(value) {
        disposed = value;
      },
    },
  );
  handlers["astro:page-load"]();
  assert.equal(scopes.length, 1);
  handlers["astro:before-swap"]();
  assert.equal(scopes[0].aborted, true);
  assert.equal(disposed, 1);
  handlers["astro:page-load"]();
  assert.equal(scopes.length, 2);
  assert.equal(scopes[1].aborted, false);
  assert.equal(disposed, 1);
});
