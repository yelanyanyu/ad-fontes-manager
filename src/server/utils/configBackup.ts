export interface ConfigurationExportOptions {
  includeSecrets: boolean;
}

export interface ConfigurationExport {
  schemaVersion: number;
  exportedAt: string;
  includeSecrets: boolean;
  config: unknown;
}

export interface ConfigurationBackupService {
  exportUserConfiguration(options: ConfigurationExportOptions): Promise<ConfigurationExport>;
  importUserConfiguration(input: ConfigurationExport): Promise<void>;
}

export function createConfigurationBackupService(): ConfigurationBackupService {
  return {
    async exportUserConfiguration(): Promise<ConfigurationExport> {
      // TODO(config-export): implement explicit user-triggered configuration export.
      throw new Error('Configuration export is not implemented yet.');
    },

    async importUserConfiguration(): Promise<void> {
      // TODO(config-export): implement import through Configuration Migration.
      throw new Error('Configuration import is not implemented yet.');
    },
  };
}
