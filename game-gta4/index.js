const path = require('path');
const { fs, log, util } = require('vortex-api');
const winapi = require('winapi-bindings');
const Promise = require('bluebird');

// Nexus Mods domain for the game. e.g. nexusmods.com/bloodstainedritualofthenight
const GAME_ID = 'gta4';

//Steam Application ID, you can get this from https://steamdb.info/apps/
const STEAMAPP_ID = '12210';
const EXEC = "GTAIV.exe"
const MOD_PATH = '.'

let tools = [
  {
    id: 'OpenIV',
    name: 'OpenIV',
    //logo: 'openiv.png',
    executable: () => 'OpenIV.exe',
    requiredFiles: [
      'OpenIV.exe',
    ],
  }
];


const OPENIV_FILE_EXTS = [ '.oiv', '.wft', '.wtd', '.wad' ];

function requireOpenIV(files) {
  return files.find(file => OPENIV_FILE_EXTS.includes(path.extname(file))) !== undefined;
}

function main(context) {
    //This is the main function Vortex will run when detecting the game extension.
	
	context.registerGame({
		id: GAME_ID,
		name: 'Grand Theft Auto IV',
		mergeMods: true,
		queryPath: findGame,
		supportedTools: tools,
		queryModPath: () => MOD_PATH,
		logo: 'gameart.jpg',
		executable: () => EXEC,
		requiredFiles: [
		  EXEC
		],
		setup: prepareForModding,
		environment: {
		  SteamAPPId: STEAMAPP_ID,
		},
		details: {
		  steamAppId: STEAMAPP_ID,
		},
	  });
	
	context.registerInstaller('gta4-mod', 20, testgtaivmod, installgtaivmod);
}

module.exports = {
    default: main,
};

function testgtaivmod(files, gameId) {
  const supported = (gameId === GAME_ID) && !requireOpenIV(files);
  return Promise.resolve({ 
    supported, 
	requiredFiles: [] 
  });
}


function installgtaivmod(files) {

  // Remove directories.
  const filtered = files.filter(file =>
    (!file.endsWith(path.sep)));

  const instructions = filtered.map(file => {
    return {
      type: 'copy',
      source: file,
      destination: file,
    };
  });

  return Promise.resolve({ instructions });
}
 
function findGame() {
  try {
    return util.GameStoreHelper.findByAppId([STEAMAPP_ID])
      .then(game => game.gamePath);
  } catch (err) {
	  const instPath = winapi.RegGetValue(
	  'HKEY_LOCAL_MACHINE',
      'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\GTA IV: The Complete Edition_is1',
	  'InstallLocation');
    if (!instPath) {
      throw new Error('empty registry key');
    }
    return Promise.resolve(instPath.value);
  }
}

function prepareForModding(discovery) {
    return fs.ensureDirAsync(discovery.path);
}
