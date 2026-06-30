const fs = require("fs");
const path = require("path");

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function getUpdateUrl(projectDir) {
  const config = readJsonIfExists(path.join(projectDir, "config.json")) || readJsonIfExists(path.join(projectDir, "config.example.json")) || {};
  if (process.env.SHIELD_UPDATE_URL || config.updateUrl) {
    return process.env.SHIELD_UPDATE_URL || config.updateUrl;
  }

  try {
    return new URL("/downloads/", config.appUrl || "https://shield.example.gov").toString();
  } catch {
    return "https://shield.example.gov/downloads/";
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const appInfo = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, "build", "icon.ico");
  const version = appInfo.shortVersion || appInfo.buildVersion || context.packager.info.metadata.version;
  const resourcesDir = path.join(context.appOutDir, "resources");
  const appUpdatePath = path.join(resourcesDir, "app-update.yml");
  const updateUrl = getUpdateUrl(context.packager.projectDir);
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

  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.writeFileSync(
    appUpdatePath,
    [
      "provider: generic",
      `url: ${updateUrl}`,
      "updaterCacheDirName: shield-desktop-updater",
      "",
    ].join("\n"),
    "utf8",
  );
};
