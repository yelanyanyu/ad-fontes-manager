import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as ResEdit from 'resedit';

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'assets', 'icon.ico');

  const [exeBuffer, iconBuffer] = await Promise.all([readFile(exePath), readFile(iconPath)]);
  const executable = ResEdit.NtExecutable.from(exeBuffer);
  const resources = ResEdit.NtExecutableResource.from(executable);
  const iconFile = ResEdit.Data.IconFile.from(iconBuffer);

  // Electron shortcuts use the packaged exe as their icon source, so the icon
  // resource must be embedded before NSIS creates desktop/start-menu shortcuts.
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    1,
    1033,
    iconFile.icons.map(item => item.data)
  );

  resources.outputResource(executable);
  await writeFile(exePath, Buffer.from(executable.generate()));
}
