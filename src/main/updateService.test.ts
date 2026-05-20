import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDesktopUpdateService,
  selectReleaseNotesText,
  type DesktopUpdateConfig,
  type UpdaterLike,
} from './updateService';

function cloneConfig(config: DesktopUpdateConfig): DesktopUpdateConfig {
  return JSON.parse(JSON.stringify(config)) as DesktopUpdateConfig;
}

class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  forceDevUpdateConfig = false;
  checkCalls = 0;
  downloadCalls = 0;
  quitAndInstallCalls: Array<{ isSilent?: boolean; isForceRunAfter?: boolean }> = [];

  constructor(private readonly version: string | null = '2.0.1') {
    super();
  }

  async checkForUpdates() {
    this.checkCalls += 1;
    if (!this.version) {
      this.emit('update-not-available', { version: '2.0.0' });
      return { updateInfo: { version: '2.0.0' } };
    }

    const updateInfo = {
      version: this.version,
      releaseName: `v${this.version}`,
      releaseNotes:
        '<!--LANG:zh-CN-->中文更新<!--LANG:END--><!--LANG:en-->English notes<!--LANG:END-->',
    };
    this.emit('update-available', updateInfo);
    return { updateInfo };
  }

  async downloadUpdate() {
    this.downloadCalls += 1;
    this.emit('update-downloaded', { version: this.version ?? '2.0.0' });
    return [];
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.quitAndInstallCalls.push({ isSilent, isForceRunAfter });
  }
}

function createConfigStore(initial: DesktopUpdateConfig = {}) {
  let current = cloneConfig(initial);
  return {
    read: () => cloneConfig(current),
    write: (next: DesktopUpdateConfig) => {
      current = cloneConfig(next);
    },
    snapshot: () => cloneConfig(current),
  };
}

void describe('desktop update service', () => {
  void it('defaults automatic software update to enabled and downloads available updates', async () => {
    const updater = new FakeUpdater('2.0.1');
    const configStore = createConfigStore();
    const service = createDesktopUpdateService({
      updater,
      readConfig: configStore.read,
      writeConfig: configStore.write,
      getActiveQueueCount: async () => 0,
      isPackaged: true,
      now: () => new Date('2026-05-20T00:00:00.000Z'),
    });

    assert.equal(service.getPreference().automatic, true);
    assert.equal(updater.autoDownload, false);
    assert.equal(updater.autoInstallOnAppQuit, false);

    const result = await service.checkForUpdates({ manual: false });

    assert.equal(result.status, 'downloaded');
    assert.equal(result.info?.version, '2.0.1');
    assert.equal(result.info?.releaseNotesText, '中文更新');
    assert.equal(updater.checkCalls, 1);
    assert.equal(updater.downloadCalls, 1);
    assert.equal(configStore.snapshot().updates?.lastCheckedAt, '2026-05-20T00:00:00.000Z');
  });

  void it('blocks install while active queue work exists unless forced', async () => {
    const updater = new FakeUpdater('2.0.1');
    const service = createDesktopUpdateService({
      updater,
      readConfig: () => ({}),
      writeConfig: () => undefined,
      getActiveQueueCount: async () => 2,
      isPackaged: true,
      now: () => new Date('2026-05-20T00:00:00.000Z'),
    });

    const blocked = await service.installUpdate();
    assert.deepEqual(blocked, { ok: false, reason: 'active-queue', activeCount: 2 });
    assert.equal(updater.quitAndInstallCalls.length, 0);

    const forced = await service.installUpdate({ force: true });
    assert.deepEqual(forced, { ok: true });
    assert.deepEqual(updater.quitAndInstallCalls, [{ isSilent: false, isForceRunAfter: true }]);
  });

  void it('does not auto-download in development mode', async () => {
    const updater = new FakeUpdater('2.0.1');
    const service = createDesktopUpdateService({
      updater,
      readConfig: () => ({}),
      writeConfig: () => undefined,
      getActiveQueueCount: async () => 0,
      isPackaged: false,
      now: () => new Date('2026-05-20T00:00:00.000Z'),
    });

    const result = await service.checkForUpdates({ manual: true });

    assert.equal(result.status, 'available');
    assert.equal(updater.downloadCalls, 0);
    assert.equal(updater.forceDevUpdateConfig, true);
  });

  void it('selects localized release notes from Cherry-style language blocks', () => {
    const notes = [
      {
        version: '2.0.1',
        note: '<!--LANG:en-->English<!--LANG:END--><!--LANG:zh-CN-->中文<!--LANG:END-->',
      },
    ];

    assert.equal(selectReleaseNotesText(notes, 'zh-CN'), '中文');
    assert.equal(selectReleaseNotesText(notes, 'en-US'), 'English');
  });
});
