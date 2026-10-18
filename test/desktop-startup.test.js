import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const entry = new URL('../desktop/main.cjs', import.meta.url);
const require = createRequire(entry);

test('early activation and second-instance events wait for Electron readiness', () => {
  let ready = false, created = 0, shown = 0;
  const app = Object.assign(new EventEmitter(), {
    setName() {}, setAppUserModelId() {}, requestSingleInstanceLock: () => true,
    isReady: () => ready, whenReady: () => new Promise(() => {}), quit() {},
  });
  class BrowserWindow extends EventEmitter {
    constructor() {
      super();
      if (!ready) throw new Error('Cannot create BrowserWindow before app is ready');
      created++;
      this.webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler() {} });
    }
    setMenu() {} loadFile() {} show() { shown++; } focus() {}
  }
  vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
    require: name => name === 'electron' ? { app, BrowserWindow } : require(name),
    __dirname: path.dirname(fileURLToPath(entry)), process, clearInterval, setTimeout,
  });
  assert.doesNotThrow(() => app.emit('activate'));
  assert.doesNotThrow(() => app.emit('second-instance'));
  assert.equal(created, 0);
  ready = true;
  app.emit('activate'); app.emit('second-instance');
  assert.equal(created, 1);
  assert.equal(shown, 2);
});
