const Promise = require('bluebird');
const path = require('path');
const { log, util } = require('vortex-api');
const winapi = require('winapi-bindings');

const GAME_ID = 'eldenring';
const GAME_NAME = 'Elden Ring';
const GAME_EXE = 'eldenring.exe';
const STEAM_APP_ID = '1245620';
const TOP_DIR = 'game';
const EXEC_PATH = path.join(TOP_DIR, GAME_EXE);

function findGame() {
  return util.steam.findByAppId([STEAM_APP_ID])
    .then(game => game.gamePath)
	.catch(() => {
      // Try finding the game from registery
      const instPath = winapi.RegGetValue('HKEY_LOCAL_MACHINE',
        'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ELDEN RING_is1',
        'InstallLocation');
      if (!instPath) throw new Error('empty registry key');
      return Promise.resolve(instPath.value);
    });
}

async function testSupportedContent(files, gameId) {
  const supported = (gameId === GAME_ID);
  return { supported, requiredFiles: [] };
}

// Try to locate the top-level mod directory and set its containing folder as the root dir.
// If there is no top-level mod directory in the archive, the archive root is the root dir.  
async function installContent(files) {
  const topDirPath = files.find(file => path.basename(file).toLowerCase() === TOP_DIR);
  const topDir = topDirPath ? topDirPath.toLowerCase() : ''
  const topDirName = path.basename(topDir);
  const idx = topDir ? topDir.indexOf(topDirName) + (topDirName).length : 0; //start index of the root-relative path
  const rootDir = idx ? topDir : ''; // root dir of the archive
  const instructions = files
    .filter(file => !file.endsWith(path.sep)     // exclude directories
                    && file.toLowerCase().startsWith(rootDir)) // include only files in the root dir
    .map(file => {
		if (file===path.basename(file))
		{
			file = '.' + path.sep + path.basename(file); //Prevents the installation of dinput,end,.. mod types in ELDEN RING instead of ELDEN RING\games for now.  
		}
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
    queryModPath: () => TOP_DIR,
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
