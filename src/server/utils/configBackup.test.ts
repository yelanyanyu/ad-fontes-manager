import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

void describe('configuration backup service', () => {
  void it('reserves Configuration Export and Import interfaces without implementing them yet', async () => {
    const { createConfigurationBackupService } = require('./configBackup') as {
      createConfigurationBackupService: () => {
        exportUserConfiguration: (options: { includeSecrets: boolean }) => Promise<unknown>;
        importUserConfiguration: (input: unknown) => Promise<void>;
      };
    };

    const service = createConfigurationBackupService();

    await assert.rejects(
      () => service.exportUserConfiguration({ includeSecrets: false }),
      /Configuration export is not implemented yet/
    );
    await assert.rejects(
      () => service.importUserConfiguration({}),
      /Configuration import is not implemented yet/
    );
  });
});
