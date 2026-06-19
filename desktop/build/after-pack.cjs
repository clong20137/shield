const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const appInfo = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, "build", "icon.ico");
  const version = appInfo.shortVersion || appInfo.buildVersion || context.packager.info.metadata.version;
  const versionStrings = {
    FileDescription: appInfo.description || appInfo.productName,
    ProductName: appInfo.productName,
    InternalName: appInfo.productFilename,
    OriginalFilename: `${appInfo.productFilename}.exe`,
  };

  if (appInfo.companyName) {
    versionStrings.CompanyName = appInfo.companyName;
  }

  if (appInfo.copyright) {
    versionStrings.LegalCopyright = appInfo.copyright;
  }

  const { rcedit } = await import("rcedit");
  await rcedit(exePath, {
    "version-string": versionStrings,
    "file-version": version,
    "product-version": version,
    icon: iconPath,
    "requested-execution-level": "asInvoker",
  });
};
