const path = require('path');
const Promise = require('bluebird');
const { fs, selectors, util } = require('vortex-api');
const turbowalk = require('turbowalk');

const STEAM_DLL = 'steam_api.dll';

// Nexus Mods id for the game.
const KENSHI_ID = 'kenshi';
const STEAM_EXE = 'kenshi_x64.exe';
const GOG_EXE = 'kenshi_GOG_x64.exe';

// The mod file is expected to be at the root of the mod
const MOD_FILE_EXT = '.mod';

function findGame() {
  return util.steam.findByAppId('233860')
      .then(game => game.gamePath);
}

function prepareForModding(discovery) {
  return fs.ensureDirWritableAsync(path.join(discovery.path, 'mods'),
    () => Promise.resolve());
}

// Kenshi's Steam version requires the game to be executed
//  via Steam in order for it to add workshop mods.
function requiresLauncher(gamePath) {
  return fs.readdirAsync(gamePath)
    .then(files => (files.find(file => file.indexOf(STEAM_DLL) !== -1) !== undefined)
      ? Promise.resolve({ launcher: 'steam' })
      : Promise.resolve(undefined))
    .catch(err => Promise.reject(err));
}

function installContent(files) {
  // The .mod file is expected to always be positioned in the root directory
  //  of the mod itself; we're going to disregard anything placed outside the root.
  const modFile = files.find(file => path.extname(file).toLowerCase() === MOD_FILE_EXT);
  const idx = modFile.indexOf(path.basename(modFile));
  const rootPath = path.dirname(modFile);

  // The mod folder MUST match the mod file (without the extension).
  const modName = path.basename(modFile, MOD_FILE_EXT);
  
  // Remove directories and anything that isn't in the rootPath.
  const filtered = files.filter(file => 
    ((file.indexOf(rootPath) !== -1) 
    && (!file.endsWith(path.sep))));

  const instructions = filtered.map(file => {
    return {
      type: 'copy',
      source: file,
      destination: path.join(modName, file.substr(idx)),
    };
  });

  return Promise.resolve({ instructions });
}

function testSupportedContent(files, gameId) {
  // Make sure we're able to support this mod.
  const supported = (gameId === KENSHI_ID) &&
    (files.find(file => path.extname(file).toLowerCase() === MOD_FILE_EXT) !== undefined);
  return Promise.resolve({
    supported,
    requiredFiles: [],
  });
}

function getExecutable(discoveryPath) {
  if (discoveryPath === undefined) {
    return STEAM_EXE;
  }

  let execFile = GOG_EXE;
  try {
    fs.statSync(path.join(discoveryPath, GOG_EXE))
  } catch (err) {
    execFile = STEAM_EXE;
  }

  return execFile;
}

function fileNameToId(filePath) {
  const file = path.isAbsolute(filePath)
    ? path.basename(filePath)
    : filePath;

  const id = file.replace(/[ ]|[0-9]/g, '');
  return id;
}

function getDiscoveryPath(api) {
  const state = api.store.getState();
  const discovery = util.getSafe(state,
    ['settings', 'gameMode', 'discovered', KENSHI_ID], {});

  return discovery?.path;
}

function readDeploymentManifest(api) {
  return util.getManifest(api, '', KENSHI_ID)
    .then((manifest) => Promise.reduce(manifest.files, (accum, iter) => {
      if (path.extname(iter.relPath) === MOD_FILE_EXT) {
        const modId = iter.source;
        accum[modId] = {
          files: [].concat(accum?.[modId]?.files || [], path.basename(iter.relPath)),
        };
      }
      return Promise.resolve(accum);
    }, {}))
}

async function serialize(api, loadOrder) {
  const discoveryPath = getDiscoveryPath(api);
  if (discoveryPath === undefined) {
    return Promise.reject(new util.NotFound('Game not found'));
  }

  const modListPath = path.join(discoveryPath, 'data', 'mods.cfg');
  return fs.writeFileAsync(modListPath, loadOrder.map(mod =>
    mod.data.modFile).join('\n'), { encoding: 'utf8' });
}

async function getDeployedMods(api) {
  const discoveryPath = getDiscoveryPath(api);
  const modsPath = path.join(discoveryPath, 'mods');
  const segments = modsPath.split(path.sep).length;
  let modFiles = [];
  return turbowalk.default(modsPath, entries => {
    const mods = entries.filter(entry =>
      (path.extname(entry.filePath) === MOD_FILE_EXT)
    && (entry.filePath.split(path.sep).length === segments + 2));

    modFiles = modFiles.concat(mods);
  })
  .catch(err => ['ENOENT', 'ENOTFOUND'].includes(err.code)
    ? Promise.resolve()
    : Promise.reject(err))
  .then(() => Promise.resolve(modFiles));
}

async function deserialize(api) {
  const discoveryPath = getDiscoveryPath(api);
  if (discoveryPath === undefined) {
    return Promise.reject(new util.NotFound('Game not found'));
  }

  const state = api.store.getState();
  const profile = selectors.activeProfile(state);
  if (profile?.gameId !== KENSHI_ID) {
    return Promise.reject(new Error('wrong game'));
  }

  const managedMods = util.getSafe(state, ['persistent', 'mods', KENSHI_ID], {});
  const deployedModFiles = await getDeployedMods(api);
  const deploymentMap = await readDeploymentManifest(api);

  const modListPath = path.join(discoveryPath, 'data', 'mods.cfg');
  const listData = await fs.readFileAsync(modListPath, { encoding: 'utf8' });
  const modList = listData.split('\n')
                          .filter(entry => !!entry)
                          .map(entry => entry.toLowerCase());

  const newLO = deployedModFiles.reduce((accum, iter) => {
    const modFile = path.basename(iter.filePath);
    const id = fileNameToId(modFile.toLowerCase());
    const isInModList = modList.find(mod => fileNameToId(mod) === id) !== undefined;
    const modId = Object.keys(deploymentMap)
      .find(id => deploymentMap[id].files?.includes(path.basename(iter.filePath)));
    const modName = (modId !== undefined)
      ? managedMods?.[modId]?.attributes?.modName
      : path.basename(modFile, MOD_FILE_EXT);
    if (isInModList) {
      accum.push({
        id,
        enabled: true,
        name: modName,
        modId,
        data: {
          modFile,
        }
      });
    } else {
      // The mod had been disabled inside the Kenshi launcher.
      accum.push({
        id,
        enabled: false,
        name: modName,
        modId,
        data: {
          modFile,
        }
      });
    }
    return accum;
  }, []);

  newLO.sort((a, b) => {
    const aId = a.data.modFile.toLowerCase();
    const bId = b.data.modFile.toLowerCase();
    return modList.indexOf(aId) - modList.indexOf(bId);
  });

  return Promise.resolve(newLO);
}

async function validate(api, prev, current) {
  const discoveryPath = getDiscoveryPath(api);
  if (discoveryPath === undefined) {
    return Promise.reject(new util.NotFound('game not found'));
  }

  const state = api.store.getState();
  const profile = selectors.activeProfile(state);
  if (profile?.gameId !== KENSHI_ID) {
    return Promise.reject(new util.ProcessCanceled('wrong game'));
  }

  const fileData = await fs.readFileAsync(path.join(discoveryPath, 'data', 'mods.cfg'), { encoding: 'utf8' });
  const entries = fileData.split('\n')
                          .filter(entry => !!entry)
                          .map(entry => ({
                            fileName: entry,
                            id: fileNameToId(entry),
                          }));
  
  const invalid = entries.filter(entry => path.extname(entry.id) !== MOD_FILE_EXT);

  return invalid.length === 0
    ? Promise.resolve(undefined)
    : Promise.resolve({
      invalid: invalid.map(invl => ({
        id: invl.fileName,
        reason: 'not a valid mod file',
      })),
    });
}

function main(context) {
  context.registerGame({
    id: KENSHI_ID,
    name: 'Kenshi',
    mergeMods: true,
    queryPath: findGame,
    queryModPath: () => 'mods',
    logo: 'gameart.jpg',
    executable: (discoveryPath) => getExecutable(discoveryPath),
    requiredFiles: [
      'OgreMain_x64.dll',
      path.join('data', 'kenshi.ico'),
    ],
    setup: prepareForModding,
    requiresLauncher,
    environment: {
      SteamAPPId: '233860',
    },
    details: {
      steamAppId: 233860,
    },
  });

  context.registerLoadOrder({
    gameId: KENSHI_ID,
    serializeLoadOrder: (loadOrder) => serialize(context.api, loadOrder),
    deserializeLoadOrder: () => deserialize(context.api),
    validate: (prev, current) => validate(context.api, prev, current),
    toggleableEntries: true,
  });

  context.registerInstaller('kenshi-mod', 25, testSupportedContent, installContent);

  return true;
}

module.exports = {
  default: main,
};
