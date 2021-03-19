const Promise = require('bluebird');
const path = require('path');
const winapi = require('winapi-bindings');
const { app, remote } = require('electron');
const { actions, fs, util } = require('vortex-api');

const uniApp = app || remote.app;

let _API;
const GAME_ID = 'dawnofman';
const STEAM_ID = 858810;
const GOG_ID = 1899257943;
const UMM_DLL = 'UnityModManager.dll';
const SCENE_FILE_EXT = '.scn.xml';
const UMM_MOD_INFO = 'Info.json';

function getSceneFolder() {
  return path.join(uniApp.getPath('documents'), 'DawnOfMan', 'Scenarios');
}

function readRegistryKey(hive, key, name) {
  try {
    const instPath = winapi.RegGetValue(hive, key, name);
    if (!instPath) {
      throw new Error('empty registry key');
    }
    return Promise.resolve(instPath.value);
  } catch (err) {
    return Promise.reject(new util.ProcessCanceled(err));
  }
}

function findGame() {
  return util.steam.findByAppId(STEAM_ID.toString())
    .then(game => game.gamePath)
    .catch(() => readRegistryKey('HKEY_LOCAL_MACHINE',
      `SOFTWARE\\WOW6432Node\\GOG.com\\Games\\${GOG_ID}`,
      'PATH'))
    .catch(() => readRegistryKey('HKEY_LOCAL_MACHINE',
      `SOFTWARE\\GOG.com\\Games\\${GOG_ID}`,
      'PATH'))
}

function prepareForModding(discovery) {
  return fs.ensureDirWritableAsync(getSceneFolder(), () => Promise.resolve())
    .then(() => fs.ensureDirWritableAsync(path.join(discovery.path, 'Mods'), () => Promise.resolve()))
}

function endsWithPattern(instructions, pattern) {
  return Promise.resolve(instructions.find(inst =>
    ((!!inst?.destination) && inst.destination.endsWith(pattern))) !== undefined);
}

function installSceneMod(files, destinationPath) {
  const sceneFile = files.find(file => file.endsWith(SCENE_FILE_EXT));
  const idx = sceneFile.indexOf(path.basename(sceneFile));
  const modName = path.basename(destinationPath, '.installing')
    .replace(/[^A-Za-z]/g, '');

  const filtered = files.filter(file => !file.endsWith(path.sep))
  const instructions = filtered.map(file => {
    return {
      type: 'copy',
      source: file,
      destination: path.join(modName, file.substr(idx)),
    };
  })

  return Promise.resolve({ instructions });
}

function installMod(files, destinationPath) {
  // The scene file is expected to be at the root of scene mods.
  const infoFile = files.find(file => file.endsWith(UMM_MOD_INFO));
  const idx = infoFile.indexOf(UMM_MOD_INFO);
  const rootPath = path.dirname(infoFile);
  const modName = path.basename(destinationPath, '.installing')
    .replace(/[^A-Za-z]/g, '');

  const filtered = files.filter(file => (!file.endsWith(path.sep))
    && (file.indexOf(rootPath) !== -1));

  const instructions = filtered.map(file => {
    return {
      type: 'copy',
      source: file,
      destination: path.join(modName, file.substr(idx)),
    };
  });

  return Promise.resolve({ instructions });
}

function isSceneMod(files) {
  return files.find(file => file.endsWith(SCENE_FILE_EXT)) !== undefined;
}

function isUMMMod(files) {
  return files.find(file => file.endsWith(UMM_MOD_INFO)) !== undefined;
}

function testSceneMod(files, gameId) {
  return Promise.resolve({
    supported: ((gameId === GAME_ID) && (isSceneMod(files))),
    requiredFiles: []
  });
}

function testMod(files, gameId) {
  return Promise.resolve({
    supported: ((gameId === GAME_ID) && (isUMMMod(files))),
    requiredFiles: []
  });
}

function main(context) {
  _API = context.api;
  context.requireExtension('modtype-bepinex');
  context.registerGame({
    id: GAME_ID,
    name: 'Dawn of Man',
    logo: 'gameart.jpg',
    mergeMods: true,
    queryPath: findGame,
    queryModPath: () => 'Mods',
    executable: () => 'DawnOfMan.exe',
    requiredFiles: [
      'DawnOfMan.exe'
    ],
    environment: {
      SteamAPPId: STEAM_ID.toString(),
    },
    details: {
      steamAppId: STEAM_ID,
    },
    setup: prepareForModding,
  });

  context.registerModType('dom-scene-modtype', 25,
    (gameId) => gameId === GAME_ID, () => getSceneFolder(),
    (instructions) => endsWithPattern(instructions, SCENE_FILE_EXT));

  context.registerInstaller('dom-scene-installer', 25, testSceneMod, installSceneMod);
  context.registerInstaller('dom-mod', 25, testMod, installMod);

  context.once(() => {
    if (context.api.ext.bepinexAddGame !== undefined) {
      context.api.ext.bepinexAddGame({
        gameId: GAME_ID,
        autoDownloadBepInEx: true,
        doorstopConfig: {
          doorstopType: 'default',
          ignoreDisableSwitch: true,
        }
      })
    }
  })
}

module.exports = {
  default: main
};
