const Promise = require('bluebird');
const path = require('path');
const { fs, log, util } = require('vortex-api');

const GAME_ID = 'eldenring';
const GAME_NAME = 'Elden Ring';
const GAME_EXE = 'eldenring.exe';
const STEAM_APP_ID = '1245620';
const MOD_DIR = 'game';
const EXEC_PATH = path.join(MOD_DIR, GAME_EXE);
const MOD_PATH = path.join('.',MOD_DIR);

// List of folders that, if present in a mod archive, determine the root dir.
const TOP_LEVEL_MOD_FOLDERS = [MOD_DIR];

function findGame() {
  return util.steam.findByAppId([STEAM_APP_ID])
    .then(game => game.gamePath);
}

async function testSupportedContent(files, gameId) {
  const supported = (gameId === GAME_ID);
  return { supported, requiredFiles: [] };
}

// Try to locate one of the top-level mod directories and set its containing folder as the root dir.
// If there are no top-level mod directories in the archive, the archive root is the root dir.  
async function installContent(files) {
  const modDirPath = files.find(file => TOP_LEVEL_MOD_FOLDERS.some(folder => path.basename(file) === folder));
  const modDir = modDirPath ? modDirPath : ''
  const modDirName = path.basename(modDir);
  const idx = modDir ? modDir.indexOf(modDirName) + (modDirName).length : 0; //start index of the root-relative path
  const rootDir = idx ? modDir : ''; // root dir of the archive
  const instructions = files
    .filter(file => !file.endsWith(path.sep)     // exclude directories
                    && file.startsWith(rootDir)) // include only files in the root dir
    .map(file => {
      log('info', `Installing file: ${file.substr(idx)}`);
      return {
        type: 'copy',
        source: file,
        destination: file.substr(idx), // root-relative path
      };
    });

  return { instructions };
}

function main(context) {
  context.registerGame({
    id: GAME_ID,
    name: GAME_NAME,
    mergeMods: true,
    queryPath: findGame,
    queryModPath: () => MOD_PATH,
    logo: 'gameart.jpg',
    executable: () => EXEC_PATH,
    requiredFiles: [
      EXEC_PATH,
    ],
    environment: {
      SteamAPPId: STEAM_APP_ID,
    },
    details: {
      steamAppId: STEAM_APP_ID,
    },
  });

  context.registerInstaller('eldenring-mod', 25, testSupportedContent, installContent);

  return true;
}

module.exports = {
  default: main,
};
